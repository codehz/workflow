// src/storages/disabled.ts - 禁用的存储实现

import { DISABLED_PROMISE } from "../constants.js";
import type {
  InstanceInfo,
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
  async saveInstance(_instanceId: string, _state: InstanceInfo): Promise<void> {
    return DISABLED_PROMISE;
  }

  /**
   * 加载实例状态。
   * @param instanceId 实例 ID
   * @returns 永不解决的 Promise
   */
  async loadInstance(_instanceId: string): Promise<InstanceInfo | null> {
    return DISABLED_PROMISE;
  }

  /**
   * 加载实例基本状态。
   * @param instanceId 实例 ID
   * @returns 永不解决的 Promise
   */
  async loadInstanceBasic(_instanceId: string): Promise<InstanceInfo | null> {
    return DISABLED_PROMISE;
  }

  /**
   * 加载指定步骤的状态。
   * @param instanceId 实例 ID
   * @param stepName 步骤名称
   * @returns 永不解决的 Promise
   */
  async loadStepState(
    _instanceId: string,
    _stepName: string,
  ): Promise<StepState | null> {
    return DISABLED_PROMISE;
  }

  /**
   * 更新实例状态。
   * @param instanceId 实例 ID
   * @param updates 要更新的字段
   * @returns 永不解决的 Promise
   */
  async updateInstance(
    _instanceId: string,
    _updates: Partial<InstanceInfo>,
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
    _instanceId: string,
    _stepName: string,
    _stepState: StepState,
  ): Promise<void> {
    return DISABLED_PROMISE;
  }

  /**
   * 删除实例。
   * @param instanceId 实例 ID
   * @returns 永不解决的 Promise
   */
  async deleteInstance(_instanceId: string): Promise<void> {
    return DISABLED_PROMISE;
  }

  /**
   * 清理实例的所有步骤状态。
   * @param instanceId 实例 ID
   * @returns 永不解决的 Promise
   */
  async clearAllStepStates(_instanceId: string): Promise<void> {
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

  /**
   * 保存 pending 事件。
   * @param instanceId 实例 ID
   * @param eventType 事件类型
   * @param payload 事件载荷
   * @returns 永不解决的 Promise
   */
  async savePendingEvent(
    _instanceId: string,
    _eventType: string,
    _payload: any,
  ): Promise<void> {
    return DISABLED_PROMISE;
  }

  /**
   * 加载并删除 pending 事件。
   * @param instanceId 实例 ID
   * @param eventType 事件类型
   * @returns 永不解决的 Promise
   */
  async loadPendingEvent(
    _instanceId: string,
    _eventType: string,
  ): Promise<{ payload: any } | null> {
    return DISABLED_PROMISE;
  }
}
