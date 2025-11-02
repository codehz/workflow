// src/storages/disabled.ts - 禁用的存储实现

import { DISABLED_PROMISE } from "../constants.js";
import type {
  InstanceStatusDetail,
  InstanceSummary,
  StepState,
  WorkflowStorage,
} from "../types.js";

/**
 * 禁用的工作流存储实现。
 * 此实现仅用于测试目的，所有操作都会返回一个永远不会解决的 Promise。
 * **警告：不要在生产环境中使用此存储实现！**
 * 它会阻止所有存储操作，导致工作流无法正常运行。
 */
export class DisabledWorkflowStorage implements WorkflowStorage {
  /**
   * 保存实例状态。
   * @param instanceId 实例 ID
   * @param state 实例状态详情
   * @returns 永不解决的 Promise
   */
  async saveInstance(
    instanceId: string,
    state: InstanceStatusDetail,
  ): Promise<void> {
    return DISABLED_PROMISE;
  }

  /**
   * 加载实例状态。
   * @param instanceId 实例 ID
   * @returns 永不解决的 Promise
   */
  async loadInstance(instanceId: string): Promise<InstanceStatusDetail | null> {
    return DISABLED_PROMISE;
  }

  /**
   * 更新实例状态。
   * @param instanceId 实例 ID
   * @param updates 要更新的字段
   * @returns 永不解决的 Promise
   */
  async updateInstance(
    instanceId: string,
    updates: Partial<InstanceStatusDetail>,
  ): Promise<void> {
    return DISABLED_PROMISE;
  }

  /**
   * 更新步骤状态。
   * @param instanceId 实例 ID
   * @param stepName 步骤名称
   * @param stepState 步骤状态
   * @returns 永不解决的 Promise
   */
  async updateStepState(
    instanceId: string,
    stepName: string,
    stepState: StepState,
  ): Promise<void> {
    return DISABLED_PROMISE;
  }

  /**
   * 删除实例。
   * @param instanceId 实例 ID
   * @returns 永不解决的 Promise
   */
  async deleteInstance(instanceId: string): Promise<void> {
    return DISABLED_PROMISE;
  }

  /**
   * 列出所有实例摘要。
   * @returns 永不解决的 Promise
   */
  async listInstanceSummaries(): Promise<InstanceSummary[]> {
    return DISABLED_PROMISE;
  }

  /**
   * 列出所有活跃实例 ID。
   * @returns 永不解决的 Promise
   */
  async listActiveInstances(): Promise<string[]> {
    return DISABLED_PROMISE;
  }
}
