// src/storages/disabled.ts - 禁用的存储实现

import { DISABLED_PROMISE } from "../constants.js";
import type {
  InstanceStatusDetail,
  InstanceSummary,
  StepState,
  WorkflowStorage,
} from "../types.js";

export class DisabledWorkflowStorage implements WorkflowStorage {
  async saveInstance(
    instanceId: string,
    state: InstanceStatusDetail,
  ): Promise<void> {
    return DISABLED_PROMISE;
  }

  async updateInstance(
    instanceId: string,
    updates: Partial<InstanceStatusDetail>,
  ): Promise<void> {
    return DISABLED_PROMISE;
  }

  async updateStepState(
    instanceId: string,
    stepName: string,
    stepState: StepState,
  ): Promise<void> {
    return DISABLED_PROMISE;
  }

  async loadInstance(instanceId: string): Promise<InstanceStatusDetail | null> {
    return DISABLED_PROMISE;
  }

  async deleteInstance(instanceId: string): Promise<void> {
    return DISABLED_PROMISE;
  }

  async listInstanceSummaries(): Promise<InstanceSummary[]> {
    return DISABLED_PROMISE;
  }

  async listActiveInstances(): Promise<string[]> {
    return DISABLED_PROMISE;
  }
}
