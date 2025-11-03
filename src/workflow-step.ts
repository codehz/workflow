import { DISABLED_PROMISE } from "./constants.js";
import { NonRetryableError } from "./errors.js";
import type {
  WorkflowStep,
  WorkflowStepConfig,
  WorkflowStorage,
} from "./types.js";
import { getErrorMessage, parseDuration } from "./utils.js";

class LocalWorkflowStep<
  EventMap extends Record<string, any> = Record<string, any>,
> implements WorkflowStep<EventMap>
{
  constructor(
    private instanceId: string,
    private storage: WorkflowStorage,
    private onEvent: (type: string) => Promise<any>,
    private isShutdown: () => boolean,
  ) {}

  async do<T>(name: string, callback: () => Promise<T>): Promise<T>;
  async do<T>(
    name: string,
    config: WorkflowStepConfig,
    callback: () => Promise<T>,
  ): Promise<T>;
  async do<T>(
    name: string,
    configOrCallback: WorkflowStepConfig | (() => Promise<T>),
    callback?: () => Promise<T>,
  ): Promise<T> {
    const config =
      typeof configOrCallback === "function" ? undefined : configOrCallback;
    const cb =
      typeof configOrCallback === "function" ? configOrCallback : callback!;

    // 加载当前状态
    const state = await this.storage.loadInstance(this.instanceId);
    if (!state) throw new Error("Instance not found");

    // 初始化 stepStates 如果不存在
    if (!state.stepStates) {
      state.stepStates = {};
    }

    const stepState = state.stepStates[name];
    if (stepState) {
      if (stepState.status === "completed") {
        return stepState.result as T;
      }
      if (stepState.status === "failed") {
        throw new Error(stepState.error);
      }
      // 如果是 running 或其他，继续
    } else {
      // 初始化步骤状态
      state.stepStates[name] = { status: "pending" };
    }

    // 执行步骤
    let result: T | undefined;
    const maxRetries = config?.retries?.limit || 0;

    // 设置为 running，如果还没有
    if (!stepState || stepState.status === "pending") {
      await this.storage.updateStepState(this.instanceId, name, {
        status: "running",
        retries: 0,
      });
    }

    let attempts = state.stepStates[name]!.retries || 0;

    if (this.isShutdown()) return DISABLED_PROMISE;

    while (attempts <= maxRetries) {
      try {
        result = await cb();
        break;
      } catch (error) {
        attempts++;
        if (error instanceof NonRetryableError || attempts > maxRetries) {
          const errorMessage = getErrorMessage(error);
          // 保存失败状态
          await this.storage.updateStepState(this.instanceId, name, {
            status: "failed",
            error: errorMessage,
            retries: attempts,
          });
          throw new Error(errorMessage);
        }
        // 等待重试
        const delay =
          typeof config!.retries!.delay === "number"
            ? config!.retries!.delay
            : 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        // 更新重试次数
        await this.storage.updateStepState(this.instanceId, name, {
          status: "running",
          retries: attempts,
        });
      }
    }

    if (result === undefined) {
      throw new Error("Step failed after retries");
    }

    // 保存成功状态
    await this.storage.updateStepState(this.instanceId, name, {
      status: "completed",
      result,
    });

    return result!;
  }

  async sleep(name: string, duration: string | number): Promise<void> {
    const ms =
      typeof duration === "string" ? parseDuration(duration) : duration;
    if (ms <= 0) {
      throw new Error(`Invalid duration: ${duration}`);
    }

    // 加载当前状态
    const state = await this.storage.loadInstance(this.instanceId);
    if (!state) throw new Error("Instance not found");
    if (!state.stepStates) state.stepStates = {};

    const stepState = state.stepStates[name];
    if (stepState && stepState.status === "completed") {
      return;
    }

    const now = Date.now();
    const endTime = now + ms;

    // 保存 sleeping 状态
    await this.storage.updateStepState(this.instanceId, name, {
      status: "sleeping",
      sleepEndTime: endTime,
    });

    const remaining = endTime - Date.now();
    if (remaining > 0) {
      if (this.isShutdown()) return DISABLED_PROMISE;
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }

    // 标记为完成
    await this.storage.updateStepState(this.instanceId, name, {
      status: "completed",
      result: undefined,
    });
  }

  async sleepUntil(name: string, timestamp: Date | number): Promise<void> {
    const target =
      typeof timestamp === "number" ? new Date(timestamp * 1000) : timestamp;
    if (isNaN(target.getTime())) {
      throw new Error(`Invalid timestamp: ${timestamp}`);
    }
    const now = new Date();
    const delay = target.getTime() - now.getTime();
    if (delay <= 0) {
      throw new Error(`Timestamp is in the past or invalid: ${timestamp}`);
    }

    // 加载当前状态
    const state = await this.storage.loadInstance(this.instanceId);
    if (!state) throw new Error("Instance not found");
    if (!state.stepStates) state.stepStates = {};

    const stepState = state.stepStates[name];
    if (stepState && stepState.status === "completed") {
      return;
    }

    const endTime = target.getTime();

    // 保存 sleeping 状态
    await this.storage.updateStepState(this.instanceId, name, {
      status: "sleeping",
      sleepEndTime: endTime,
    });

    const remaining = endTime - Date.now();
    if (remaining > 0) {
      if (this.isShutdown()) return DISABLED_PROMISE;
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }

    // 标记为完成
    await this.storage.updateStepState(this.instanceId, name, {
      status: "completed",
      result: undefined,
    });
  }

  async waitForEvent<K extends keyof EventMap>(
    name: string,
    options: { type: K; timeout?: string | number },
  ): Promise<EventMap[K]> {
    const eventType = options.type as string;
    const timeoutMs = options.timeout
      ? typeof options.timeout === "string"
        ? parseDuration(options.timeout)
        : options.timeout
      : 24 * 60 * 60 * 1000; // 默认24小时

    // 加载当前状态
    const state = await this.storage.loadInstance(this.instanceId);
    if (!state) throw new Error("Instance not found");
    if (!state.stepStates) state.stepStates = {};

    const stepState = state.stepStates[name];
    if (stepState) {
      if (stepState.status === "completed") {
        return stepState.result;
      }
      if (stepState.status === "failed") {
        throw new Error(stepState.error);
      }
      // 如果是 waitingForEvent，继续等待
    }

    // 保存 waiting 状态
    await this.storage.updateStepState(this.instanceId, name, {
      status: "waitingForEvent",
      waitEventType: eventType,
      waitTimeout: timeoutMs,
    });

    if (this.isShutdown()) return DISABLED_PROMISE;

    try {
      const result = await Promise.race([
        this.onEvent(eventType),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), timeoutMs),
        ),
      ]);

      // 保存成功状态
      await this.storage.updateStepState(this.instanceId, name, {
        status: "completed",
        result,
      });

      return result as EventMap[K];
    } catch (error) {
      // 保存失败状态
      await this.storage.updateStepState(this.instanceId, name, {
        status: "failed",
        error: getErrorMessage(error),
      });
      throw error;
    }
  }
}

export { LocalWorkflowStep };
