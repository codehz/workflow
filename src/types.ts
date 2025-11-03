// types.ts - 定义工作流相关的类型

/**
 * 工作流事件接口，表示触发工作流实例的事件。
 * @template T 事件载荷的类型
 */
export interface WorkflowEvent<T = unknown> {
  /** 事件的只读载荷数据 */
  payload: Readonly<T>;
  /** 事件发生的时间戳 */
  timestamp: Date;
  /** 关联的工作流实例ID */
  instanceId: string;
}

/**
 * 工作流步骤配置接口，用于定义步骤的重试和超时行为。
 */
export interface WorkflowStepConfig {
  /** 可选的重试配置 */
  retries?: {
    /** 最大重试次数 */
    limit: number;
    /** 重试延迟时间，支持字符串（如 '1 second'）或数字（毫秒） */
    delay: string | number;
    /** 重试策略，默认为 'constant' */
    backoff?: "constant" | "exponential";
  };
  /** 可选的超时时间，支持字符串（如 '30 seconds'）或数字（毫秒） */
  timeout?: string | number;
}

/**
 * 工作流实例状态枚举
 */
export type InstanceStatus =
  | "queued" // 队列中
  | "running" // 运行中
  | "paused" // 已暂停
  | "errored" // 出错
  | "terminated" // 已终止
  | "complete" // 已完成
  | "waiting" // 等待中
  | "waitingForPause" // 等待暂停
  | "unknown"; // 未知状态

/**
 * 步骤状态类型，表示步骤的当前执行状态
 */
export type StepState =
  | { status: "pending"; retries?: number } // 待执行
  | { status: "running"; retries?: number } // 执行中
  | { status: "completed"; result: any; retries?: number } // 已完成
  | { status: "failed"; error: string; retries?: number } // 失败
  | { status: "sleeping"; sleepEndTime: number; retries?: number } // 休眠中
  | {
      status: "waitingForEvent"; // 等待事件
      waitEventType: string;
      waitTimeout?: number;
      retries?: number;
    };

/**
 * 工作流实例状态详情接口
 * @template Params 实例参数的类型
 * @template Result 结果类型
 */
export interface InstanceStatusDetail<Params = unknown, Result = void> {
  /** 实例的当前状态 */
  status: InstanceStatus;
  /** 可选的错误信息 */
  error?: string;
  /** 可选的输出结果 */
  output?: Result;
  /** 触发此实例的事件 */
  event: WorkflowEvent<Params>;
  /** 所有步骤的状态记录，用于恢复 */
  stepStates?: Record<string, StepState>;
}

/**
 * 工作流实例摘要接口
 */
export interface InstanceSummary {
  /** 实例ID */
  id: string;
  /** 实例状态 */
  status: InstanceStatus;
}

/**
 * 创建工作流实例的选项接口
 * @template Params 实例参数的类型
 */
export interface WorkflowInstanceCreateOptions<Params = unknown> {
  /** 可选的实例ID，如果不提供将自动生成 */
  id?: string;
  /** 可选的实例参数 */
  params?: Params;
}

/**
 * 工作流步骤接口，提供执行步骤的方法
 * @template EventMap 事件映射类型
 */
export interface WorkflowStep<
  EventMap extends Record<string, any> = Record<string, any>,
> {
  /**
   * 执行一个步骤
   * @param name 步骤名称
   * @param callback 执行回调函数
   * @returns 步骤执行结果
   * @example
   * ```ts
   * await step.do('process-data', async () => {
   *   const data = await fetchData();
   *   return processData(data);
   * });
   * ```
   */
  do<T>(name: string, callback: () => Promise<T>): Promise<T>;

  /**
   * 执行一个步骤，支持配置重试和超时
   * @param name 步骤名称
   * @param config 步骤配置
   * @param callback 执行回调函数
   * @returns 步骤执行结果
   * @example
   * ```ts
   * await step.do('retry-task', {
   *   retries: { limit: 3, delay: '1 second', backoff: 'exponential' },
   *   timeout: '30 seconds'
   * }, async () => {
   *   return await riskyOperation();
   * });
   * ```
   */
  do<T>(
    name: string,
    config: WorkflowStepConfig,
    callback: () => Promise<T>,
  ): Promise<T>;

  /**
   * 让步骤休眠指定的持续时间
   * @param name 步骤名称
   * @param duration 休眠持续时间，支持字符串（如 '5 minutes'）或数字（毫秒）
   * @example
   * ```ts
   * await step.sleep('wait-for-api', '30 seconds');
   * ```
   */
  sleep(name: string, duration: string | number): Promise<void>;

  /**
   * 让步骤休眠直到指定的时间戳
   * @param name 步骤名称
   * @param timestamp 休眠结束的时间戳
   * @example
   * ```ts
   * const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
   * await step.sleepUntil('daily-reset', tomorrow);
   * ```
   */
  sleepUntil(name: string, timestamp: Date | number): Promise<void>;

  /**
   * 等待指定类型的事件
   * @param name 步骤名称
   * @param options 等待选项，包括事件类型和可选的超时时间
   * @returns 事件载荷
   * @example
   * ```ts
   * const userInput = await step.waitForEvent('user-approval', {
   *   type: 'approval',
   *   timeout: '1 hour'
   * });
   * ```
   */
  waitForEvent<K extends keyof EventMap>(
    name: string,
    options: { type: K; timeout?: string | number },
  ): Promise<EventMap[K]>;
}

/**
 * 工作流实例接口，提供实例管理方法
 * @template Params 实例参数类型
 * @template EventMap 事件映射类型
 * @template Result 结果类型
 */
export interface WorkflowInstance<
  Params = unknown,
  EventMap extends Record<string, any> = Record<string, any>,
  Result = void,
> {
  /** 实例ID */
  id: string;

  /**
   * 暂停实例执行
   * @example
   * ```ts
   * await instance.pause();
   * ```
   */
  pause(): Promise<void>;

  /**
   * 恢复实例执行
   * @example
   * ```ts
   * await instance.resume();
   * ```
   */
  resume(): Promise<void>;

  /**
   * 终止实例执行
   * @example
   * ```ts
   * await instance.terminate();
   * ```
   */
  terminate(): Promise<void>;

  /**
   * 重启实例
   * @example
   * ```ts
   * await instance.restart();
   * ```
   */
  restart(): Promise<void>;

  /**
   * 获取实例状态详情
   * @returns 实例状态详情
   * @example
   * ```ts
   * const status = await instance.status();
   * console.log(`Instance is ${status.status}`);
   * ```
   */
  status(): Promise<InstanceStatusDetail<Params, Result>>;

  /**
   * 向实例发送事件
   * @param options 事件选项，包括类型和可选的载荷
   * @example
   * ```ts
   * await instance.sendEvent({
   *   type: 'user-input',
   *   payload: { action: 'approve' }
   * });
   * ```
   */
  sendEvent<K extends keyof EventMap>(options: {
    type: K;
    payload?: EventMap[K];
  }): Promise<void>;
}

/**
 * 工作流接口，提供创建和管理实例的方法
 * @template Params 实例参数类型
 * @template EventMap 事件映射类型
 * @template Result 结果类型
 */
export interface Workflow<
  Params = unknown,
  EventMap extends Record<string, any> = Record<string, any>,
  Result = void,
> {
  /**
   * 创建一个新的工作流实例
   * @param options 创建选项，可选的ID和参数
   * @returns 新创建的工作流实例
   * @example
   * ```ts
   * const instance = await workflow.create({
   *   id: 'custom-id',
   *   params: { userId: 123 }
   * });
   * ```
   */
  create(
    options?: WorkflowInstanceCreateOptions<Params>,
  ): Promise<WorkflowInstance<Params, EventMap, Result>>;

  /**
   * 批量创建工作流实例
   * @param batch 创建选项数组
   * @returns 创建的实例数组
   * @example
   * ```ts
   * const instances = await workflow.createBatch([
   *   { params: { task: 'task1' } },
   *   { params: { task: 'task2' } }
   * ]);
   * ```
   */
  createBatch(
    batch: WorkflowInstanceCreateOptions<Params>[],
  ): Promise<WorkflowInstance<Params, EventMap, Result>[]>;

  /**
   * 根据ID获取工作流实例
   * @param id 实例ID
   * @returns 工作流实例
   * @example
   * ```ts
   * const instance = await workflow.get('instance-id');
   * ```
   */
  get(id: string): Promise<WorkflowInstance<Params, EventMap, Result>>;

  /**
   * 恢复所有活动实例的状态
   * @example
   * ```ts
   * await workflow.recover();
   * ```
   */
  recover(): Promise<void>;
}

/**
 * 工作流入口点抽象类，用户需要继承此类实现工作流逻辑
 * @template Env 环境类型
 * @template Params 参数类型
 * @template EventMap 事件映射类型
 * @template Result 结果类型
 */
export abstract class WorkflowEntrypoint<
  Env = unknown,
  Params = unknown,
  EventMap extends Record<string, any> = Record<string, any>,
  Result = void,
> {
  /**
   * 构造函数
   * @param env 环境对象
   */
  constructor(protected env: Env) {}

  /**
   * 创建一个继承WorkflowEntrypoint的类，从函数自动生成
   * @param fn 执行函数，this为环境对象
   * @returns 继承WorkflowEntrypoint的类
   * @example
   * ```ts
   * const MyWorkflow = WorkflowEntrypoint.create<Env, { task: string }, { approval: boolean }, string>(
   *   async function(event, step) {
   *     // this 指向 env，可以访问 apiKey
   *     console.log('API Key:', this.apiKey);
   *
   *     await step.do('process', async () => {
   *       return `Processed ${event.payload.task}`;
   *     });
   *
   *     const approval = await step.waitForEvent('approval', { type: 'approval' });
   *     return approval ? 'Approved' : 'Rejected';
   *   }
   * );
   * ```
   */
  static create<Env, Params, EventMap extends Record<string, any>, Result>(
    fn: (
      event: WorkflowEvent<Params>,
      step: WorkflowStep<EventMap>,
    ) => Promise<Result>,
  ): new (env: Env) => WorkflowEntrypoint<Env, Params, EventMap, Result> {
    return class extends WorkflowEntrypoint<Env, Params, EventMap, Result> {
      async run(
        event: WorkflowEvent<Params>,
        step: WorkflowStep<EventMap>,
      ): Promise<Result> {
        return fn.call(this.env, event, step);
      }
    };
  }

  /**
   * 运行工作流的抽象方法
   * @param event 触发事件
   * @param step 步骤执行器
   * @returns 执行结果
   * @example
   * ```ts
   * class MyWorkflow extends WorkflowEntrypoint {
   *   async run(event, step) {
   *     await step.do('step1', async () => {
   *       console.log('Processing', event.payload);
   *       return 'done';
   *     });
   *   }
   * }
   * ```
   */
  abstract run(
    event: WorkflowEvent<Params>,
    step: WorkflowStep<EventMap>,
  ): Promise<Result>;
}

/**
 * 工作流存储接口，用于持久化实例状态
 */
export interface WorkflowStorage {
  /**
   * 保存实例状态
   * @param instanceId 实例ID
   * @param state 实例状态详情
   * @example
   * ```ts
   * await storage.saveInstance('instance-1', {
   *   status: 'running',
   *   event: { payload: {}, timestamp: new Date(), instanceId: 'instance-1' }
   * });
   * ```
   */
  saveInstance(
    instanceId: string,
    state: InstanceStatusDetail<unknown, unknown>,
  ): Promise<void>;

  /**
   * 更新实例状态
   * @param instanceId 实例ID
   * @param updates 状态更新对象
   * @example
   * ```ts
   * await storage.updateInstance('instance-1', { status: 'paused' });
   * ```
   */
  updateInstance(
    instanceId: string,
    updates: Partial<InstanceStatusDetail<unknown, unknown>>,
  ): Promise<void>;

  /**
   * 更新步骤状态
   * @param instanceId 实例ID
   * @param stepName 步骤名称
   * @param stepState 步骤状态
   * @example
   * ```ts
   * await storage.updateStepState('instance-1', 'step1', {
   *   status: 'completed',
   *   result: 'success'
   * });
   * ```
   */
  updateStepState(
    instanceId: string,
    stepName: string,
    stepState: StepState,
  ): Promise<void>;

  /**
   * 加载实例状态
   * @param instanceId 实例ID
   * @returns 实例状态详情，如果不存在则返回null
   * @example
   * ```ts
   * const state = await storage.loadInstance('instance-1');
   * if (state) {
   *   console.log('Status:', state.status);
   * }
   * ```
   */
  loadInstance(
    instanceId: string,
  ): Promise<InstanceStatusDetail<unknown, unknown> | null>;

  /**
   * 删除实例
   * @param instanceId 实例ID
   * @example
   * ```ts
   * await storage.deleteInstance('instance-1');
   * ```
   */
  deleteInstance(instanceId: string): Promise<void>;

  /**
   * 列出所有实例摘要
   * @returns 实例摘要数组
   * @example
   * ```ts
   * const summaries = await storage.listInstanceSummaries();
   * summaries.forEach(s => console.log(`${s.id}: ${s.status}`));
   * ```
   */
  listInstanceSummaries(): Promise<InstanceSummary[]>;

  /**
   * 列出所有活动实例ID
   * @returns 活动实例ID数组
   * @example
   * ```ts
   * const activeIds = await storage.listActiveInstances();
   * console.log('Active instances:', activeIds);
   * ```
   */
  listActiveInstances(): Promise<string[]>;
}
