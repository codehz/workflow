// storage.ts - 存储接口和内存实现

import type { InstanceStatusDetail } from './types.js';

export interface WorkflowStorage {
  saveInstance(instanceId: string, state: InstanceStatusDetail): Promise<void>;
  loadInstance(instanceId: string): Promise<InstanceStatusDetail | null>;
  deleteInstance(instanceId: string): Promise<void>;
  listInstances(): Promise<string[]>;
}

export class InMemoryWorkflowStorage implements WorkflowStorage {
  private storage = new Map<string, InstanceStatusDetail>();

  async saveInstance(instanceId: string, state: InstanceStatusDetail): Promise<void> {
    this.storage.set(instanceId, { ...state });
  }

  async loadInstance(instanceId: string): Promise<InstanceStatusDetail | null> {
    return this.storage.get(instanceId) || null;
  }

  async deleteInstance(instanceId: string): Promise<void> {
    this.storage.delete(instanceId);
  }

  async listInstances(): Promise<string[]> {
    return Array.from(this.storage.keys());
  }
}

// 可以扩展其他实现，如文件存储、数据库存储等