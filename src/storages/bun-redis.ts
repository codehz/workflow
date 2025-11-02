import { RedisClient } from "bun";

import type {
  InstanceStatusDetail,
  InstanceSummary,
  StepState,
  WorkflowStorage,
} from "../types.js";

const TIME_MULTIPLIER = 1000000000000000; // 1e15
const STATUS_SCORES = {
  terminated: 0,
  complete: 1,
  // 其他状态都是活跃的，用2
  active: 2,
} as const;

function getStatusScore(status: string): number {
  if (status === "terminated") return STATUS_SCORES.terminated;
  if (status === "complete") return STATUS_SCORES.complete;
  return STATUS_SCORES.active;
}

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

  private getInstancesZSetKey(): string {
    return `${this.prefix}:instances`;
  }

  async saveInstance(
    instanceId: string,
    state: InstanceStatusDetail,
  ): Promise<void> {
    const statusKey = this.getStatusKey(instanceId);
    const stepsHashKey = this.getStepsHashKey(instanceId);
    const errorKey = this.getErrorKey(instanceId);
    const outputKey = this.getOutputKey(instanceId);
    const eventKey = this.getEventKey(instanceId);

    // 并发执行所有独立的 set/del 操作
    const operations: Promise<any>[] = [
      this.client.set(statusKey, this.serialize(state.status)),
      this.client.del(stepsHashKey), // 清空哈希
    ];

    if (state.stepStates && Object.keys(state.stepStates).length > 0) {
      const hashFields = Object.entries(state.stepStates).flatMap(([k, v]) => [
        k,
        this.serialize(v),
      ]);
      operations.push(this.client.hmset(stepsHashKey, hashFields));
    }

    // 处理其他字段
    if (state.error !== undefined) {
      operations.push(this.client.set(errorKey, this.serialize(state.error)));
    } else {
      operations.push(this.client.del(errorKey));
    }

    if (state.output !== undefined) {
      operations.push(this.client.set(outputKey, this.serialize(state.output)));
    } else {
      operations.push(this.client.del(outputKey));
    }

    if (state.event !== undefined) {
      operations.push(this.client.set(eventKey, this.serialize(state.event)));
    } else {
      operations.push(this.client.del(eventKey));
    }

    await Promise.all(operations);

    // 计算score并添加到zset（依赖event）
    const statusScore = getStatusScore(state.status);
    const timestamp = state.event.timestamp.getTime();
    const score = statusScore * TIME_MULTIPLIER + timestamp;
    await this.client.zadd(this.getInstancesZSetKey(), score, instanceId);
  }

  async updateInstance(
    instanceId: string,
    updates: Partial<InstanceStatusDetail>,
  ): Promise<void> {
    const operations: Promise<any>[] = [];

    if (updates.status !== undefined) {
      operations.push(
        this.client.set(
          this.getStatusKey(instanceId),
          this.serialize(updates.status),
        ),
      );
    }

    if (updates.stepStates !== undefined) {
      const stepsHashKey = this.getStepsHashKey(instanceId);
      operations.push(this.client.del(stepsHashKey));
      if (Object.keys(updates.stepStates).length > 0) {
        const hashFields = Object.entries(updates.stepStates).flatMap(
          ([k, v]) => [k, this.serialize(v)],
        );
        operations.push(this.client.hmset(stepsHashKey, hashFields));
      }
    }

    // 处理其他字段
    if (updates.error !== undefined) {
      operations.push(
        this.client.set(
          this.getErrorKey(instanceId),
          this.serialize(updates.error),
        ),
      );
    }

    if (updates.output !== undefined) {
      operations.push(
        this.client.set(
          this.getOutputKey(instanceId),
          this.serialize(updates.output),
        ),
      );
    }

    if (updates.event !== undefined) {
      operations.push(
        this.client.set(
          this.getEventKey(instanceId),
          this.serialize(updates.event),
        ),
      );
    }

    await Promise.all(operations);

    // 如果更新了status，需要更新zset score
    if (updates.status !== undefined) {
      const eventStr = await this.client.get(this.getEventKey(instanceId));
      if (eventStr) {
        const event = this.deserialize(eventStr);
        const statusScore = getStatusScore(updates.status);
        const timestamp = new Date(event.timestamp).getTime();
        const score = statusScore * TIME_MULTIPLIER + timestamp;
        await this.client.zadd(this.getInstancesZSetKey(), score, instanceId);
      }
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
    await Promise.all([
      this.client.del(
        this.getStatusKey(instanceId),
        this.getStepsHashKey(instanceId),
        this.getErrorKey(instanceId),
        this.getOutputKey(instanceId),
        this.getEventKey(instanceId),
      ),
      this.client.zrem(this.getInstancesZSetKey(), instanceId),
    ]);
  }

  async listInstanceSummaries(): Promise<InstanceSummary[]> {
    // 获取所有实例ID（按score排序，从低到高）
    const instanceIds = await this.client.zrange(
      this.getInstancesZSetKey(),
      0,
      -1,
    );
    const summaries: InstanceSummary[] = [];
    // 并发获取所有状态
    const statusPromises = instanceIds.map((id) =>
      this.client.get(this.getStatusKey(id)),
    );
    const statusStrings = await Promise.all(statusPromises);
    for (let i = 0; i < instanceIds.length; i++) {
      const statusStr = statusStrings[i];
      if (statusStr) {
        const status = this.deserialize(statusStr);
        summaries.push({ id: instanceIds[i]!, status });
      }
    }
    return summaries;
  }

  async listActiveInstances(): Promise<string[]> {
    // 获取所有活跃实例（score >= 2*TIME_MULTIPLIER）
    const minScore = STATUS_SCORES.active * TIME_MULTIPLIER;
    return await this.client.zrangebyscore(
      this.getInstancesZSetKey(),
      minScore,
      "+inf",
    );
  }
}
