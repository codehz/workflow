// workflow.ts - 核心工作流实现

import type {
  WorkflowEvent,
  WorkflowStep,
  Workflow,
  WorkflowInstance,
  InstanceStatusDetail,
  WorkflowInstanceCreateOptions,
  WorkflowStepConfig
} from './types.js';
import { WorkflowEntrypoint, NonRetryableError } from './types.js';
import type { WorkflowStorage } from './storage.js';
import { InMemoryWorkflowStorage } from './storage.js';

class LocalWorkflowStep implements WorkflowStep {
  constructor(
    private instanceId: string,
    private storage: WorkflowStorage,
    private onEvent: (type: string) => Promise<any>
  ) {}

  async do<T>(name: string, callback: () => Promise<T>): Promise<T>;
  async do<T>(name: string, config: WorkflowStepConfig, callback: () => Promise<T>): Promise<T>;
  async do<T>(name: string, configOrCallback: WorkflowStepConfig | (() => Promise<T>), callback?: () => Promise<T>): Promise<T> {
    const config = typeof configOrCallback === 'function' ? undefined : configOrCallback;
    const cb = typeof configOrCallback === 'function' ? configOrCallback : callback!;

    // 加载当前状态
    const state = await this.storage.loadInstance(this.instanceId);
    if (!state) throw new Error('Instance not found');

    // 如果是恢复，检查是否已经执行过此步骤
    if (state.currentStep === name && state.stepState) {
      return state.stepState as T;
    }

    // 执行步骤
    // 执行步骤
    let result: T | undefined;
    let attempts = 0;
    const maxRetries = config?.retries?.limit || 0;

    while (attempts <= maxRetries) {
      try {
        result = await cb();
        break;
      } catch (error) {
        attempts++;
        if (error instanceof NonRetryableError || attempts > maxRetries) {
          throw error;
        }
        // 等待重试
        const delay = typeof config!.retries!.delay === 'number' ? config!.retries!.delay : 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    if (result === undefined) {
      throw new Error('Step failed after retries');
    }

    // 保存状态
    await this.storage.saveInstance(this.instanceId, {
      ...state,
      currentStep: name,
      stepState: result
    });

    return result!;
  }

  async sleep(name: string, duration: string | number): Promise<void> {
    const ms = typeof duration === 'string' ? parseDuration(duration) : duration;
    if (ms <= 0) {
      throw new Error(`Invalid duration: ${duration}`);
    }
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  async sleepUntil(name: string, timestamp: Date | number): Promise<void> {
    const target = typeof timestamp === 'number' ? new Date(timestamp * 1000) : timestamp;
    if (isNaN(target.getTime())) {
      throw new Error(`Invalid timestamp: ${timestamp}`);
    }
    const now = new Date();
    const delay = target.getTime() - now.getTime();
    if (delay <= 0) {
      throw new Error(`Timestamp is in the past or invalid: ${timestamp}`);
    }
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async waitForEvent(name: string, options: { type: string; timeout?: string | number }): Promise<any> {
    const timeoutMs = options.timeout ? (typeof options.timeout === 'string' ? parseDuration(options.timeout) : options.timeout) : 24 * 60 * 60 * 1000; // 默认24小时

    return Promise.race([
      this.onEvent(options.type),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs))
    ]);
  }
}

function parseDuration(duration: string): number {
  // 简单解析，如 "1 hour", "30 seconds"
  const match = duration.match(/(\d+)\s*(second|minute|hour|day)s?/);
  if (!match || !match[1]) throw new Error(`Invalid duration format: ${duration}`);
  const value = parseInt(match[1]);
  const unit = match[2];
  switch (unit) {
    case 'second': return value * 1000;
    case 'minute': return value * 60 * 1000;
    case 'hour': return value * 60 * 60 * 1000;
    case 'day': return value * 24 * 60 * 60 * 1000;
    default: throw new Error(`Invalid duration unit: ${unit}`);
  }
}

class LocalWorkflowInstance implements WorkflowInstance {
  constructor(
    public id: string,
    private storage: WorkflowStorage,
    private executor: WorkflowExecutor
  ) {}

  async pause(): Promise<void> {
    const state = await this.storage.loadInstance(this.id);
    if (state) {
      state.status = 'paused';
      await this.storage.saveInstance(this.id, state);
    }
  }

  async resume(): Promise<void> {
    await this.executor.resumeInstance(this.id);
  }

  async terminate(): Promise<void> {
    const state = await this.storage.loadInstance(this.id);
    if (state) {
      state.status = 'terminated';
      await this.storage.saveInstance(this.id, state);
    }
  }

  async restart(): Promise<void> {
    await this.executor.restartInstance(this.id);
  }

  async status(): Promise<InstanceStatusDetail> {
    const state = await this.storage.loadInstance(this.id);
    return state || { status: 'unknown' };
  }

  async sendEvent(options: { type: string; payload?: any }): Promise<void> {
    this.executor.sendEvent(this.id, options.type, options.payload);
  }
}

class WorkflowExecutor {
  private running = new Map<string, Promise<void>>();
  private eventListeners = new Map<string, Map<string, (payload: any) => void>>();

  constructor(
    private workflowClass: new (env: any) => WorkflowEntrypoint,
    private env: any,
    private storage: WorkflowStorage
  ) {}

  async createInstance(options: WorkflowInstanceCreateOptions): Promise<WorkflowInstance> {
    const id = options.id || generateId();
    const event: WorkflowEvent = {
      payload: options.params || {},
      timestamp: new Date(),
      instanceId: id
    };

    const initialState: InstanceStatusDetail = {
      status: 'queued',
      output: undefined,
      // 将触发事件保存到状态中，便于恢复/重启
      event
    };
    await this.storage.saveInstance(id, initialState);

    const instance = new LocalWorkflowInstance(id, this.storage, this);
    this.startInstance(id, event);
    return instance;
  }

  private async startInstance(instanceId: string, event: WorkflowEvent): Promise<void> {
    const workflow = new this.workflowClass(this.env);
    const step = new LocalWorkflowStep(instanceId, this.storage, async (type) => {
      return new Promise((resolve) => {
        if (!this.eventListeners.has(instanceId)) {
          this.eventListeners.set(instanceId, new Map());
        }
        this.eventListeners.get(instanceId)!.set(type, resolve);
      });
    });

    const runPromise = (async () => {
      try {
        const currentState = await this.storage.loadInstance(instanceId);
        await this.storage.saveInstance(instanceId, { ...currentState, status: 'running' });
        const output = await workflow.run(event, step);
        const finalState = await this.storage.loadInstance(instanceId);
        await this.storage.saveInstance(instanceId, { ...finalState, status: 'complete', output });
      } catch (error) {
        const errorState = await this.storage.loadInstance(instanceId);
        await this.storage.saveInstance(instanceId, { ...errorState, status: 'errored', error: (error as Error).message });
      }
    })();

    this.running.set(instanceId, runPromise);
    await runPromise;
  }

  async resumeInstance(instanceId: string): Promise<void> {
    const state = await this.storage.loadInstance(instanceId);
    if (!state) throw new Error(`Instance ${instanceId} not found`);

    // 只有在 paused 状态时才恢复
    if (state.status !== 'paused') return;

    if (!state.event) throw new Error(`No event stored for instance ${instanceId}`);

    // 标记为 running 并保存
    state.status = 'running';
    await this.storage.saveInstance(instanceId, state);

    // 清除之前的运行状态
    this.running.delete(instanceId);

    // 重新启动执行（从存储的事件开始）
    await this.startInstance(instanceId, state.event);
  }

  async restartInstance(instanceId: string): Promise<void> {
    const state = await this.storage.loadInstance(instanceId);
    if (!state) throw new Error(`Instance ${instanceId} not found`);

    if (!state.event) throw new Error(`No event stored for instance ${instanceId}`);

    // 清除步骤进度，设置为 queued
    state.currentStep = undefined;
    state.stepState = undefined;
    state.status = 'queued';
    await this.storage.saveInstance(instanceId, state);

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

  async getInstance(id: string): Promise<WorkflowInstance> {
    const state = await this.storage.loadInstance(id);
    if (!state) throw new Error('Instance not found');
    return new LocalWorkflowInstance(id, this.storage, this);
  }
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

export class LocalWorkflow implements Workflow {
  private executor: WorkflowExecutor;

  constructor(
    workflowClass: new (env: any) => WorkflowEntrypoint,
    env: any = {},
    storage: WorkflowStorage = new InMemoryWorkflowStorage()
  ) {
    this.executor = new WorkflowExecutor(workflowClass, env, storage);
  }

  async create(options?: WorkflowInstanceCreateOptions): Promise<WorkflowInstance> {
    return this.executor.createInstance(options || {});
  }

  async createBatch(batch: WorkflowInstanceCreateOptions[]): Promise<WorkflowInstance[]> {
    return Promise.all(batch.map(options => this.create(options)));
  }

  async get(id: string): Promise<WorkflowInstance> {
    return this.executor.getInstance(id);
  }
}