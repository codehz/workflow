// src/storages/in-memory.ts - 内存存储实现

import type {
  InstanceInfo,
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
  private storage = new Map<string, InstanceInfo>();
  /** 存储步骤状态的 Map，键格式为 "instanceId:stepName" */
  private stepStorage = new Map<string, StepState>();
  /** 存储 pending 事件的 Map，键格式为 "instanceId:eventType" */
  private pendingEvents = new Map<string, any>();

  /**
   * 保存实例状态到内存。
   * @param instanceId 实例 ID
   * @param state 实例状态详情
   */
  async saveInstance(instanceId: string, state: InstanceInfo): Promise<void> {
    this.storage.set(instanceId, { ...state });
  }

  /**
   * 从内存加载实例状态。
   * @param instanceId 实例 ID
   * @returns 实例状态详情，如果不存在或无效则返回 null
   */
  async loadInstance(instanceId: string): Promise<InstanceInfo | null> {
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
    updates: Partial<InstanceInfo>,
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
    // 确保实例存在
    const existing = this.storage.get(instanceId);
    if (!existing) {
      throw new Error(`Instance ${instanceId} not found`);
    }
    this.stepStorage.set(`${instanceId}:${stepName}`, stepState);
  }

  /**
   * 从内存加载指定步骤的状态。
   * @param instanceId 实例 ID
   * @param stepName 步骤名称
   * @returns 步骤状态，如果不存在则返回 null
   */
  async loadStepState(
    instanceId: string,
    stepName: string,
  ): Promise<StepState | null> {
    return this.stepStorage.get(`${instanceId}:${stepName}`) || null;
  }

  /**
   * 删除实例。
   * @param instanceId 实例 ID
   */
  async deleteInstance(instanceId: string): Promise<void> {
    this.storage.delete(instanceId);
    // 删除所有相关的步骤状态
    for (const key of this.stepStorage.keys()) {
      if (key.startsWith(`${instanceId}:`)) {
        this.stepStorage.delete(key);
      }
    }
  }

  /**
   * 清理实例的所有步骤状态。
   * @param instanceId 实例 ID
   */
  async clearAllStepStates(instanceId: string): Promise<void> {
    // 删除所有相关的步骤状态
    for (const key of this.stepStorage.keys()) {
      if (key.startsWith(`${instanceId}:`)) {
        this.stepStorage.delete(key);
      }
    }
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

  /**
   * 保存 pending 事件。
   * @param instanceId 实例 ID
   * @param eventType 事件类型
   * @param payload 事件载荷
   */
  async savePendingEvent(
    instanceId: string,
    eventType: string,
    payload: any,
  ): Promise<void> {
    const key = `${instanceId}:${eventType}`;
    // 只有在没有pending事件时才保存（避免覆盖已存在的pending事件）
    if (!this.pendingEvents.has(key)) {
      this.pendingEvents.set(key, payload);
    }
  }

  /**
   * 加载并删除 pending 事件。
   * @param instanceId 实例 ID
   * @param eventType 事件类型
   * @returns 包含事件载荷的对象，如果不存在则返回 null
   */
  async loadPendingEvent(
    instanceId: string,
    eventType: string,
  ): Promise<{ payload: any } | null> {
    const key = `${instanceId}:${eventType}`;
    const payload = this.pendingEvents.get(key);
    if (payload !== undefined) {
      this.pendingEvents.delete(key);
      return { payload };
    }
    return null;
  }
}
