// workflow.ts - 核心工作流实现

import { DISABLED_PROMISE } from "./constants.js";
import { NonRetryableError } from "./errors.js";
import { DisabledWorkflowStorage } from "./storages/disabled.js";
import { InMemoryWorkflowStorage } from "./storages/in-memory.js";
import type {
  InstanceStatusDetail,
  Workflow,
  WorkflowEvent,
  WorkflowInstance,
  WorkflowInstanceCreateOptions,
  WorkflowStep,
  WorkflowStepConfig,
} from "./types.js";
import { WorkflowEntrypoint, type WorkflowStorage } from "./types.js";

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
          // 保存失败状态
          await this.storage.updateStepState(this.instanceId, name, {
            status: "failed",
            error: getErrorMessage(error),
            retries: attempts,
          });
          throw error;
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

function parseDuration(duration: string): number {
  // 简单解析，如 "1 hour", "30 seconds"
  const match = duration.match(/(\d+)\s*(second|minute|hour|day)s?/);
  if (!match || !match[1])
    throw new Error(`Invalid duration format: ${duration}`);
  const value = parseInt(match[1]);
  const unit = match[2];
  switch (unit) {
    case "second":
      return value * 1000;
    case "minute":
      return value * 60 * 1000;
    case "hour":
      return value * 60 * 60 * 1000;
    case "day":
      return value * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Invalid duration unit: ${unit}`);
  }
}

class LocalWorkflowInstance<
  Env,
  Params = any,
  EventMap extends Record<string, any> = Record<string, any>,
> implements WorkflowInstance<Params, EventMap>
{
  constructor(
    public id: string,
    private executor: WorkflowExecutor<Env, Params>,
  ) {}

  get storage(): WorkflowStorage {
    return this.executor.storage;
  }

  async pause(): Promise<void> {
    try {
      await this.storage.updateInstance(this.id, { status: "paused" });
    } catch (error) {
      // Instance not found, ignore
    }
  }

  async resume(): Promise<void> {
    await this.executor.resumeInstance(this.id);
  }

  async terminate(): Promise<void> {
    try {
      await this.storage.updateInstance(this.id, { status: "terminated" });
    } catch (error) {
      // Instance not found, ignore
    }
  }

  async restart(): Promise<void> {
    await this.executor.restartInstance(this.id);
  }

  async status(): Promise<InstanceStatusDetail<Params>> {
    const state = await this.storage.loadInstance(this.id);
    if (!state) throw new Error(`Instance ${this.id} not found`);
    return state;
  }

  async sendEvent<K extends keyof EventMap>(options: {
    type: K;
    payload?: EventMap[K];
  }): Promise<void> {
    this.executor.sendEvent(this.id, options.type as string, options.payload);
  }
}

class WorkflowExecutor<
  Env,
  Params = any,
  EventMap extends Record<string, any> = Record<string, any>,
> {
  private running = new Map<string, Promise<void>>();
  private eventListeners = new Map<
    string,
    Map<string, (payload: any) => void>
  >();
  private isShutdown = false;

  constructor(
    private workflowClass: new (
      env: Env,
    ) => WorkflowEntrypoint<Env, Params, EventMap>,
    private env: Env,
    private _storage: WorkflowStorage,
  ) {}

  get storage(): WorkflowStorage {
    return this._storage;
  }

  async createInstance(
    options: WorkflowInstanceCreateOptions<Params>,
  ): Promise<WorkflowInstance<Params, EventMap>> {
    const id = options.id || generateId();
    const event: WorkflowEvent<Params> = {
      payload: options.params || ({} as Params),
      timestamp: new Date(),
      instanceId: id,
    };

    const initialState: InstanceStatusDetail<Params> = {
      status: "queued",
      output: undefined,
      // 将触发事件保存到状态中，便于恢复/重启
      event,
    };
    await this.storage.saveInstance(id, initialState);

    const instance = new LocalWorkflowInstance<Env, Params, EventMap>(id, this);
    this.startInstance(id, event);
    return instance;
  }

  private async startInstance(
    instanceId: string,
    event: WorkflowEvent<Params>,
  ): Promise<void> {
    const workflow = new this.workflowClass(this.env);
    const step = new LocalWorkflowStep<EventMap>(
      instanceId,
      this.storage,
      async (type) => {
        return new Promise((resolve) => {
          if (!this.eventListeners.has(instanceId)) {
            this.eventListeners.set(instanceId, new Map());
          }
          this.eventListeners.get(instanceId)!.set(type, resolve);
        });
      },
      () => this.isShutdown,
    );

    const runPromise = (async () => {
      try {
        await this.storage.updateInstance(instanceId, { status: "running" });
        const output = await workflow.run(event, step);
        await this.storage.updateInstance(instanceId, {
          status: "complete",
          output,
        });
      } catch (error) {
        await this.storage.updateInstance(instanceId, {
          status: "errored",
          error: getErrorMessage(error),
        });
      }
    })();

    this.running.set(instanceId, runPromise);
    await runPromise;
  }

  async resumeInstance(instanceId: string): Promise<void> {
    const state = await this.storage.loadInstance(instanceId);
    if (!state) throw new Error(`Instance ${instanceId} not found`);

    // 只有在 paused 状态时才恢复
    if (state.status !== "paused") return;

    if (!state.event)
      throw new Error(`No event stored for instance ${instanceId}`);

    // 标记为 running 并保存
    await this.storage.updateInstance(instanceId, { status: "running" });

    // 清除之前的运行状态
    this.running.delete(instanceId);

    // 重新启动执行（从存储的事件开始）
    await this.startInstance(instanceId, state.event);
  }

  async restartInstance(instanceId: string): Promise<void> {
    const state = await this.storage.loadInstance(instanceId);
    if (!state) throw new Error(`Instance ${instanceId} not found`);

    if (!state.event)
      throw new Error(`No event stored for instance ${instanceId}`);

    // 清除步骤进度，设置为 queued
    await this.storage.updateInstance(instanceId, {
      stepStates: {}, // 清除所有步骤状态
      status: "queued",
    });

    // 清除之前的运行状态
    this.running.delete(instanceId);

    // 启动新执行
    await this.startInstance(instanceId, state.event);
  }

  sendEvent(instanceId: string, type: string, payload: any): void {
    const listeners = this.eventListeners.get(instanceId);
    if (listeners) {
      const listener = listeners.get(type);
      if (listener) {
        listener(payload);
        listeners.delete(type);
      }
    }
  }

  async recoverAll(): Promise<void> {
    // 获取所有活跃实例ID
    const activeInstanceIds = await this.storage.listActiveInstances();

    for (const id of activeInstanceIds) {
      const state = await this.storage.loadInstance(id);
      if (!state) continue;

      if (!state.event) {
        console.warn(`Instance ${id} has no event stored, skipping recovery`);
        continue;
      }

      if (state.status === "paused") {
        // 对于暂停的实例，恢复执行
        await this.resumeInstance(id);
      } else if (
        state.status === "queued" ||
        state.status === "running" ||
        state.status === "waiting" ||
        state.status === "waitingForPause"
      ) {
        // 对于其他未完成状态，重新启动执行
        await this.startInstance(id, state.event);
      }
    }
  }

  async getInstance(id: string): Promise<WorkflowInstance<Params, EventMap>> {
    const state = await this.storage.loadInstance(id);
    if (!state) throw new Error("Instance not found");
    return new LocalWorkflowInstance<Env, Params, EventMap>(id, this);
  }

  async shutdown(): Promise<void> {
    this.isShutdown = true;
    this._storage = new DisabledWorkflowStorage();
  }
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export class LocalWorkflow<
  Env,
  Params = any,
  EventMap extends Record<string, any> = Record<string, any>,
> implements Workflow<Params, EventMap>
{
  private executor: WorkflowExecutor<Env, Params, EventMap>;

  constructor(
    workflowClass: new (env: Env) => WorkflowEntrypoint<Env, Params, EventMap>,
    env: Env = {} as Env,
    storage: WorkflowStorage = new InMemoryWorkflowStorage(),
  ) {
    this.executor = new WorkflowExecutor<Env, Params, EventMap>(
      workflowClass,
      env,
      storage,
    );
  }

  async create(
    options?: WorkflowInstanceCreateOptions<Params>,
  ): Promise<WorkflowInstance<Params, EventMap>> {
    return this.executor.createInstance(options || {});
  }

  async createBatch(
    batch: WorkflowInstanceCreateOptions<Params>[],
  ): Promise<WorkflowInstance<Params, EventMap>[]> {
    return Promise.all(batch.map((options) => this.create(options)));
  }

  async get(id: string): Promise<WorkflowInstance<Params, EventMap>> {
    return this.executor.getInstance(id);
  }

  async recover(): Promise<void> {
    return this.executor.recoverAll();
  }

  async shutdown(): Promise<void> {
    return this.executor.shutdown();
  }
}
