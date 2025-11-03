import type { InstanceStatusDetail, WorkflowInstance } from "./types.js";
import { WorkflowExecutor } from "./workflow-executor.js";

class LocalWorkflowInstance<
  Env,
  Params = unknown,
  EventMap extends Record<string, any> = Record<string, any>,
  Result = void,
> implements WorkflowInstance<Params, EventMap, Result>
{
  constructor(
    public id: string,
    private executor: WorkflowExecutor<Env, Params, EventMap, Result>,
  ) {}

  get storage() {
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

  async status(): Promise<InstanceStatusDetail<Params, Result>> {
    const state = await this.storage.loadInstance(this.id);
    if (!state) throw new Error(`Instance ${this.id} not found`);
    return state as InstanceStatusDetail<Params, Result>;
  }

  async sendEvent<K extends keyof EventMap>(options: {
    type: K;
    payload?: EventMap[K];
  }): Promise<void> {
    this.executor.sendEvent(this.id, options.type as string, options.payload);
  }
}

export { LocalWorkflowInstance };
