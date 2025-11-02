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
    backoff?: "constant" | "exponential";
  };
  timeout?: string | number;
}

export type InstanceStatus =
  | "queued"
  | "running"
  | "paused"
  | "errored"
  | "terminated"
  | "complete"
  | "waiting"
  | "waitingForPause"
  | "unknown";

export type StepState =
  | { status: "pending"; retries?: number }
  | { status: "running"; retries?: number }
  | { status: "completed"; result: any; retries?: number }
  | { status: "failed"; error: string; retries?: number }
  | { status: "sleeping"; sleepEndTime: number; retries?: number }
  | {
      status: "waitingForEvent";
      waitEventType: string;
      waitTimeout?: number;
      retries?: number;
    };

export interface InstanceStatusDetail<Params = any> {
  status: InstanceStatus;
  error?: string;
  output?: any;
  currentStep?: string;
  stepState?: any;
  // 保存触发此实例的事件，便于恢复和重启
  event?: WorkflowEvent<Params>;
  // 保存所有步骤的状态，便于恢复
  stepStates?: Record<string, StepState>;
}

export interface InstanceSummary {
  id: string;
  status: InstanceStatus;
}

export interface WorkflowInstanceCreateOptions<Params = any> {
  id?: string;
  params?: Params;
}

export interface WorkflowStep<
  EventMap extends Record<string, any> = Record<string, any>,
> {
  do<T>(name: string, callback: () => Promise<T>): Promise<T>;
  do<T>(
    name: string,
    config: WorkflowStepConfig,
    callback: () => Promise<T>,
  ): Promise<T>;
  sleep(name: string, duration: string | number): Promise<void>;
  sleepUntil(name: string, timestamp: Date | number): Promise<void>;
  waitForEvent<K extends keyof EventMap>(
    name: string,
    options: { type: K; timeout?: string | number },
  ): Promise<EventMap[K]>;
}

export interface WorkflowInstance<
  Params = any,
  EventMap extends Record<string, any> = Record<string, any>,
> {
  id: string;
  pause(): Promise<void>;
  resume(): Promise<void>;
  terminate(): Promise<void>;
  restart(): Promise<void>;
  status(): Promise<InstanceStatusDetail<Params>>;
  sendEvent<K extends keyof EventMap>(options: {
    type: K;
    payload?: EventMap[K];
  }): Promise<void>;
}

export interface Workflow<
  Params = any,
  EventMap extends Record<string, any> = Record<string, any>,
> {
  create(
    options?: WorkflowInstanceCreateOptions<Params>,
  ): Promise<WorkflowInstance<Params, EventMap>>;
  createBatch(
    batch: WorkflowInstanceCreateOptions<Params>[],
  ): Promise<WorkflowInstance<Params, EventMap>[]>;
  get(id: string): Promise<WorkflowInstance<Params, EventMap>>;
  recover(): Promise<void>;
}

export abstract class WorkflowEntrypoint<
  Env = any,
  Params = any,
  EventMap extends Record<string, any> = Record<string, any>,
> {
  constructor(protected env: Env) {}

  abstract run(
    event: WorkflowEvent<Params>,
    step: WorkflowStep<EventMap>,
  ): Promise<any>;
}

export interface WorkflowStorage {
  saveInstance(instanceId: string, state: InstanceStatusDetail): Promise<void>;
  updateInstance(
    instanceId: string,
    updates: Partial<InstanceStatusDetail>,
  ): Promise<void>;
  updateStepState(
    instanceId: string,
    stepName: string,
    stepState: StepState,
  ): Promise<void>;
  loadInstance(instanceId: string): Promise<InstanceStatusDetail | null>;
  deleteInstance(instanceId: string): Promise<void>;
  listInstanceSummaries(): Promise<InstanceSummary[]>;
  listActiveInstances(): Promise<string[]>;
}
