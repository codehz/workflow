import { DisabledWorkflowStorage } from "./storages/disabled.js";
import type {
  InstanceInfo,
  WorkflowEvent,
  WorkflowInstanceCreateOptions,
} from "./types.js";
import { WorkflowEntrypoint, type WorkflowStorage } from "./types.js";
import { generateId, getErrorMessage } from "./utils.js";
import { LocalWorkflowInstance } from "./workflow-instance.js";
import { LocalWorkflowStep } from "./workflow-step.js";

class WorkflowExecutor<
  Env,
  Params = unknown,
  EventMap extends Record<string, any> = Record<string, any>,
  Result = void,
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
    ) => WorkflowEntrypoint<Env, Params, EventMap, Result>,
    private env: Env,
    private _storage: WorkflowStorage,
  ) {}

  get storage(): WorkflowStorage {
    return this._storage;
  }

  async createInstance(
    options: WorkflowInstanceCreateOptions<Params>,
  ): Promise<LocalWorkflowInstance<Env, Params, EventMap, Result>> {
    const id = options.id || generateId();
    const event: WorkflowEvent<Params> = {
      payload: options.params || ({} as Params),
      timestamp: new Date(),
      instanceId: id,
    };

    const initialState: InstanceInfo<Params, Result> = {
      status: "queued",
      output: undefined,
      // 将触发事件保存到状态中，便于恢复/重启
      event,
    };
    await this.storage.saveInstance(id, initialState);

    const instance = new LocalWorkflowInstance<Env, Params, EventMap, Result>(
      id,
      this,
    );
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
    await this.startInstance(instanceId, state.event as WorkflowEvent<Params>);
  }

  async restartInstance(instanceId: string): Promise<void> {
    const state = await this.storage.loadInstance(instanceId);
    if (!state) throw new Error(`Instance ${instanceId} not found`);

    if (!state.event)
      throw new Error(`No event stored for instance ${instanceId}`);

    // 清除步骤进度，设置为 queued
    await this.storage.updateInstance(instanceId, {
      status: "queued",
    });

    // 清除所有步骤状态
    await this.storage.clearAllStepStates(instanceId);

    // 清除之前的运行状态
    this.running.delete(instanceId);

    // 启动新执行
    await this.startInstance(instanceId, state.event as WorkflowEvent<Params>);
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
        await this.startInstance(id, state.event as WorkflowEvent<Params>);
      }
    }
  }

  async getInstance(
    id: string,
  ): Promise<LocalWorkflowInstance<Env, Params, EventMap, Result>> {
    const state = await this.storage.loadInstance(id);
    if (!state) throw new Error("Instance not found");
    return new LocalWorkflowInstance<Env, Params, EventMap, Result>(id, this);
  }

  async shutdown(): Promise<void> {
    this.isShutdown = true;
    this._storage = new DisabledWorkflowStorage();
  }
}

export { WorkflowExecutor };
