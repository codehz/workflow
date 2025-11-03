// workflow.ts - 核心工作流实现

import { InMemoryWorkflowStorage } from "./storages/in-memory.js";
import type {
  Workflow,
  WorkflowEntrypoint,
  WorkflowInstance,
  WorkflowInstanceCreateOptions,
  WorkflowStorage,
} from "./types.js";
import { WorkflowExecutor } from "./workflow-executor.js";

export class LocalWorkflow<
  Env,
  Params = unknown,
  EventMap extends Record<string, any> = Record<string, any>,
  Result = void,
> implements Workflow<Params, EventMap, Result>
{
  private executor: WorkflowExecutor<Env, Params, EventMap, Result>;

  /**
   * 构造函数
   * @param workflowClass 工作流入口点类
   * @param env 环境对象，默认为空对象
   * @param storage 存储实现，默认为内存存储
   * @example
   * ```ts
   * class MyWorkflow extends WorkflowEntrypoint {
   *   async run(event, step) {
   *     // 工作流逻辑
   *   }
   * }
   *
   * const workflow = new LocalWorkflow(MyWorkflow, { apiKey: 'key' });
   * ```
   */
  constructor(
    workflowClass: new (
      env: Env,
    ) => WorkflowEntrypoint<Env, Params, EventMap, Result>,
    env: Env = {} as Env,
    storage: WorkflowStorage = new InMemoryWorkflowStorage(),
  ) {
    this.executor = new WorkflowExecutor<Env, Params, EventMap, Result>(
      workflowClass,
      env,
      storage,
    );
  }

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
  async create(
    options?: WorkflowInstanceCreateOptions<Params>,
  ): Promise<WorkflowInstance<Params, EventMap, Result>> {
    return this.executor.createInstance(options || {});
  }

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
  async createBatch(
    batch: WorkflowInstanceCreateOptions<Params>[],
  ): Promise<WorkflowInstance<Params, EventMap, Result>[]> {
    return Promise.all(batch.map((options) => this.create(options)));
  }

  /**
   * 根据ID获取工作流实例
   * @param id 实例ID
   * @returns 工作流实例
   * @example
   * ```ts
   * const instance = await workflow.get('instance-id');
   * ```
   */
  async get(id: string): Promise<WorkflowInstance<Params, EventMap, Result>> {
    return this.executor.getInstance(id);
  }

  /**
   * 恢复所有活动实例的状态
   * @example
   * ```ts
   * await workflow.recover();
   * ```
   */
  async recover(): Promise<void> {
    return this.executor.recoverAll();
  }

  /**
   * 关闭工作流，停止所有执行
   * @example
   * ```ts
   * await workflow.shutdown();
   * ```
   */
  async shutdown(): Promise<void> {
    return this.executor.shutdown();
  }
}
