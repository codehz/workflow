// src/storages/in-memory.ts - 内存存储实现

import type {
  InstanceStatusDetail,
  InstanceSummary,
  StepState,
  WorkflowStorage,
} from "../types.js";

/**
 * 内存工作流存储实现。
 * 使用内存中的 Map 存储工作流实例的状态。
 * 注意：此实现不持久化数据，重启后数据会丢失。
 */
export class InMemoryWorkflowStorage implements WorkflowStorage {
  /** 存储实例数据的 Map */
  private storage = new Map<string, InstanceStatusDetail>();

  /**
   * 保存实例状态到内存。
   * @param instanceId 实例 ID
   * @param state 实例状态详情
   */
  async saveInstance(
    instanceId: string,
    state: InstanceStatusDetail,
  ): Promise<void> {
    this.storage.set(instanceId, { ...state });
  }

  /**
   * 从内存加载实例状态。
   * @param instanceId 实例 ID
   * @returns 实例状态详情，如果不存在或无效则返回 null
   */
  async loadInstance(instanceId: string): Promise<InstanceStatusDetail | null> {
    const instance = this.storage.get(instanceId);
    if (!instance || !instance.event) {
      return null;
    }
    return instance;
  }

  /**
   * 更新实例状态。
   * @param instanceId 实例 ID
   * @param updates 要更新的字段
   * @throws 如果实例不存在则抛出错误
   */
  async updateInstance(
    instanceId: string,
    updates: Partial<InstanceStatusDetail>,
  ): Promise<void> {
    const existing = this.storage.get(instanceId);
    if (existing) {
      this.storage.set(instanceId, { ...existing, ...updates });
    } else {
      // 如果不存在，抛出错误
      throw new Error(`Instance ${instanceId} not found`);
    }
  }

  /**
   * 更新步骤状态。
   * @param instanceId 实例 ID
   * @param stepName 步骤名称
   * @param stepState 步骤状态
   * @throws 如果实例不存在则抛出错误
   */
  async updateStepState(
    instanceId: string,
    stepName: string,
    stepState: StepState,
  ): Promise<void> {
    const existing = this.storage.get(instanceId);
    if (existing) {
      const stepStates = existing.stepStates || {};
      stepStates[stepName] = stepState;
      this.storage.set(instanceId, { ...existing, stepStates });
    } else {
      throw new Error(`Instance ${instanceId} not found`);
    }
  }

  /**
   * 删除实例。
   * @param instanceId 实例 ID
   */
  async deleteInstance(instanceId: string): Promise<void> {
    this.storage.delete(instanceId);
  }

  /**
   * 列出所有实例摘要。
   * @returns 实例摘要列表
   */
  async listInstanceSummaries(): Promise<InstanceSummary[]> {
    return Array.from(this.storage.entries()).map(([id, state]) => ({
      id,
      status: state.status,
    }));
  }

  /**
   * 列出所有活跃实例 ID。
   * @returns 活跃实例 ID 列表（状态不是 terminated 或 complete）
   */
  async listActiveInstances(): Promise<string[]> {
    return Array.from(this.storage.entries())
      .filter(
        ([_, state]) =>
          state.status !== "terminated" && state.status !== "complete",
      )
      .map(([id]) => id);
  }
}
