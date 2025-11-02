// src/storages/in-memory.ts - 内存存储实现

import type {
  InstanceStatusDetail,
  InstanceSummary,
  StepState,
  WorkflowStorage,
} from "../types.js";

export class InMemoryWorkflowStorage implements WorkflowStorage {
  private storage = new Map<string, InstanceStatusDetail>();

  async saveInstance(
    instanceId: string,
    state: InstanceStatusDetail,
  ): Promise<void> {
    this.storage.set(instanceId, { ...state });
  }

  async updateInstance(
    instanceId: string,
    updates: Partial<InstanceStatusDetail>,
  ): Promise<void> {
    const existing = this.storage.get(instanceId);
    if (existing) {
      this.storage.set(instanceId, { ...existing, ...updates });
    } else {
      // 如果不存在，可以选择创建或抛错，这里假设只更新存在的
      throw new Error(`Instance ${instanceId} not found`);
    }
  }

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

  async loadInstance(instanceId: string): Promise<InstanceStatusDetail | null> {
    const instance = this.storage.get(instanceId);
    if (!instance || !instance.event) {
      return null;
    }
    return instance;
  }

  async deleteInstance(instanceId: string): Promise<void> {
    this.storage.delete(instanceId);
  }

  async listInstanceSummaries(): Promise<InstanceSummary[]> {
    return Array.from(this.storage.entries()).map(([id, state]) => ({
      id,
      status: state.status,
    }));
  }

  async listActiveInstances(): Promise<string[]> {
    return Array.from(this.storage.entries())
      .filter(
        ([_, state]) =>
          state.status !== "terminated" && state.status !== "complete",
      )
      .map(([id]) => id);
  }
}
