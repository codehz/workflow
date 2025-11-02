// types.ts - 定义工作流相关的类型

export interface WorkflowEvent<T = any> {
  payload: Readonly<T>;
  timestamp: Date;
  instanceId: string;
}

export interface WorkflowStepConfig {
  retries?: {
    limit: number;
    delay: string | number;
    backoff?: 'constant' | 'exponential';
  };
  timeout?: string | number;
}

export type InstanceStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'errored'
  | 'terminated'
  | 'complete'
  | 'waiting'
  | 'waitingForPause'
  | 'unknown';

export interface InstanceStatusDetail<Params = any> {
  status: InstanceStatus;
  error?: string;
  output?: any;
  currentStep?: string;
  stepState?: any;
  // 保存触发此实例的事件，便于恢复和重启
  event?: WorkflowEvent<Params>;
  // 保存所有步骤的状态，便于恢复
  stepStates?: Record<string, {
    status: 'pending' | 'running' | 'completed' | 'failed' | 'sleeping' | 'waitingForEvent';
    result?: any;
    error?: string;
    retries?: number;
    sleepEndTime?: number; // 对于 sleep，结束时间戳
    waitEventType?: string; // 对于 waitForEvent
    waitTimeout?: number;
  }>;
}

export interface WorkflowInstanceCreateOptions<Params = any> {
  id?: string;
  params?: Params;
}

export interface WorkflowStep {
  do<T>(name: string, callback: () => Promise<T>): Promise<T>;
  do<T>(name: string, config: WorkflowStepConfig, callback: () => Promise<T>): Promise<T>;
  sleep(name: string, duration: string | number): Promise<void>;
  sleepUntil(name: string, timestamp: Date | number): Promise<void>;
  waitForEvent(name: string, options: { type: string; timeout?: string | number }): Promise<any>;
}

export interface WorkflowInstance<Params = any> {
  id: string;
  pause(): Promise<void>;
  resume(): Promise<void>;
  terminate(): Promise<void>;
  restart(): Promise<void>;
  status(): Promise<InstanceStatusDetail<Params>>;
  sendEvent(options: { type: string; payload?: any }): Promise<void>;
}

export interface Workflow<Params = any> {
  create(options?: WorkflowInstanceCreateOptions<Params>): Promise<WorkflowInstance<Params>>;
  createBatch(batch: WorkflowInstanceCreateOptions<Params>[]): Promise<WorkflowInstance<Params>[]>;
  get(id: string): Promise<WorkflowInstance<Params>>;
  recover(): Promise<void>;
}

export abstract class WorkflowEntrypoint<Env = any, Params = any> {
  constructor(protected env: Env) {}

  abstract run(event: WorkflowEvent<Params>, step: WorkflowStep): Promise<any>;
}

export class NonRetryableError extends Error {
  constructor(message: string, name?: string) {
    super(message);
    this.name = name || 'NonRetryableError';
  }
}