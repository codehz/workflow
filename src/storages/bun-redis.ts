import { RedisClient } from "bun";

import type {
  InstanceStatusDetail,
  InstanceSummary,
  StepState,
  WorkflowStorage,
} from "../types.js";

export class BunRedisWorkflowStorage implements WorkflowStorage {
  constructor(
    private client: RedisClient,
    private prefix: string,
    private serialize: (obj: any) => string = JSON.stringify,
    private deserialize: (str: string) => any = JSON.parse,
  ) {}

  private getInstanceKey(instanceId: string): string {
    return `${this.prefix}:instance:${instanceId}`;
  }

  private getStatusKey(instanceId: string): string {
    return `${this.getInstanceKey(instanceId)}:status`;
  }

  private getStepsHashKey(instanceId: string): string {
    return `${this.getInstanceKey(instanceId)}:steps`;
  }

  private getErrorKey(instanceId: string): string {
    return `${this.getInstanceKey(instanceId)}:error`;
  }

  private getOutputKey(instanceId: string): string {
    return `${this.getInstanceKey(instanceId)}:output`;
  }

  private getEventKey(instanceId: string): string {
    return `${this.getInstanceKey(instanceId)}:event`;
  }

  private getInstancesSetKey(): string {
    return `${this.prefix}:instances`;
  }

  async saveInstance(
    instanceId: string,
    state: InstanceStatusDetail,
  ): Promise<void> {
    const statusKey = this.getStatusKey(instanceId);
    await this.client.set(statusKey, this.serialize(state.status));

    const stepsHashKey = this.getStepsHashKey(instanceId);
    await this.client.del(stepsHashKey); // 清空哈希
    if (state.stepStates && Object.keys(state.stepStates).length > 0) {
      const hashFields = Object.entries(state.stepStates).flatMap(([k, v]) => [
        k,
        this.serialize(v),
      ]);
      await this.client.hmset(stepsHashKey, hashFields);
    }

    // 处理其他字段
    if (state.error !== undefined) {
      await this.client.set(
        this.getErrorKey(instanceId),
        this.serialize(state.error),
      );
    } else {
      await this.client.del(this.getErrorKey(instanceId));
    }

    if (state.output !== undefined) {
      await this.client.set(
        this.getOutputKey(instanceId),
        this.serialize(state.output),
      );
    } else {
      await this.client.del(this.getOutputKey(instanceId));
    }

    if (state.event !== undefined) {
      await this.client.set(
        this.getEventKey(instanceId),
        this.serialize(state.event),
      );
    } else {
      await this.client.del(this.getEventKey(instanceId));
    }

    // 添加到instances set
    await this.client.sadd(this.getInstancesSetKey(), instanceId);
  }

  async updateInstance(
    instanceId: string,
    updates: Partial<InstanceStatusDetail>,
  ): Promise<void> {
    if (updates.status !== undefined) {
      await this.client.set(
        this.getStatusKey(instanceId),
        this.serialize(updates.status),
      );
    }

    if (updates.stepStates !== undefined) {
      const stepsHashKey = this.getStepsHashKey(instanceId);
      await this.client.del(stepsHashKey);
      if (Object.keys(updates.stepStates).length > 0) {
        const hashFields = Object.entries(updates.stepStates).flatMap(
          ([k, v]) => [k, this.serialize(v)],
        );
        await this.client.hmset(stepsHashKey, hashFields);
      }
    }

    // 处理其他字段
    if (updates.error !== undefined) {
      await this.client.set(
        this.getErrorKey(instanceId),
        this.serialize(updates.error),
      );
    }

    if (updates.output !== undefined) {
      await this.client.set(
        this.getOutputKey(instanceId),
        this.serialize(updates.output),
      );
    }

    if (updates.event !== undefined) {
      await this.client.set(
        this.getEventKey(instanceId),
        this.serialize(updates.event),
      );
    }
  }

  async updateStepState(
    instanceId: string,
    stepName: string,
    stepState: StepState,
  ): Promise<void> {
    await this.client.hset(
      this.getStepsHashKey(instanceId),
      stepName,
      this.serialize(stepState),
    );
  }

  async loadInstance(instanceId: string): Promise<InstanceStatusDetail | null> {
    const statusStr = await this.client.get(this.getStatusKey(instanceId));
    if (!statusStr) return null;

    const status = this.deserialize(statusStr);
    const stepsHash = await this.client.hgetall(
      this.getStepsHashKey(instanceId),
    );
    const stepStates: Record<string, StepState> = {};
    for (const [k, v] of Object.entries(stepsHash)) {
      stepStates[k] = this.deserialize(v as string);
    }

    // 加载其他字段
    const [errorStr, outputStr, eventStr] = await Promise.all([
      this.client.get(this.getErrorKey(instanceId)),
      this.client.get(this.getOutputKey(instanceId)),
      this.client.get(this.getEventKey(instanceId)),
    ]);

    if (!eventStr) {
      // 无效实例，没有事件数据，丢弃
      return null;
    }

    const result: InstanceStatusDetail = {
      status,
      stepStates,
      event: this.deserialize(eventStr),
    };

    if (errorStr) result.error = this.deserialize(errorStr);
    if (outputStr) result.output = this.deserialize(outputStr);

    return result;
  }

  async deleteInstance(instanceId: string): Promise<void> {
    await this.client.del(
      this.getStatusKey(instanceId),
      this.getStepsHashKey(instanceId),
      this.getErrorKey(instanceId),
      this.getOutputKey(instanceId),
      this.getEventKey(instanceId),
    );
    await this.client.srem(this.getInstancesSetKey(), instanceId);
  }

  async listInstanceSummaries(): Promise<InstanceSummary[]> {
    const instanceIds = await this.client.smembers(this.getInstancesSetKey());
    const summaries: InstanceSummary[] = [];
    for (const id of instanceIds) {
      const statusStr = await this.client.get(this.getStatusKey(id));
      if (statusStr) {
        const status = this.deserialize(statusStr);
        summaries.push({ id, status });
      }
    }
    return summaries;
  }

  async listActiveInstances(): Promise<string[]> {
    const summaries = await this.listInstanceSummaries();
    return summaries
      .filter((s) => s.status !== "terminated" && s.status !== "complete")
      .map((s) => s.id);
  }
}
