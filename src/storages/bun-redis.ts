import { RedisClient } from "bun";

import type {
  InstanceInfo,
  InstanceSummary,
  StepState,
  WorkflowStorage,
} from "../types.js";

/**
 * 时间戳乘数，用于计算 Redis ZSet 的分数。
 * 将状态分数与时间戳结合，确保排序正确。
 */
const TIME_MULTIPLIER = 1000000000000000; // 1e15

/**
 * 状态分数映射，用于 Redis ZSet 排序。
 * terminated: 0, complete: 1, active: 2（其他状态默认为活跃）。
 */
const STATUS_SCORES = {
  terminated: 0,
  complete: 1,
  active: 2,
} as const;

/**
 * 根据状态字符串获取分数。
 * @param status 实例状态
 * @returns 对应的分数
 */
function getStatusScore(status: string): number {
  if (status === "terminated") return STATUS_SCORES.terminated;
  if (status === "complete") return STATUS_SCORES.complete;
  return STATUS_SCORES.active;
}

/**
 * 基于 Bun 的 Redis 工作流存储实现。
 * 使用 Redis 存储工作流实例的状态、步骤、错误、输出和事件。
 * 支持实例的保存、加载、更新、删除和列表查询。
 */
export class BunRedisWorkflowStorage implements WorkflowStorage {
  /**
   * 构造函数。
   * @param client Redis 客户端实例
   * @param prefix Redis 键的前缀
   * @param serialize 序列化函数，默认使用 JSON.stringify
   * @param deserialize 反序列化函数，默认使用 JSON.parse
   */
  constructor(
    private client: RedisClient,
    private prefix: string,
    private serialize: (obj: any) => string = JSON.stringify,
    private deserialize: (str: string) => any = JSON.parse,
  ) {}

  /**
   * 获取实例键。
   * @param instanceId 实例 ID
   * @returns Redis 键
   */
  private getInstanceKey(instanceId: string): string {
    return `${this.prefix}:instance:${instanceId}`;
  }

  /**
   * 获取状态键。
   * @param instanceId 实例 ID
   * @returns Redis 键
   */
  private getStatusKey(instanceId: string): string {
    return `${this.getInstanceKey(instanceId)}:status`;
  }

  /**
   * 获取步骤哈希键。
   * @param instanceId 实例 ID
   * @returns Redis 键
   */
  private getStepsHashKey(instanceId: string): string {
    return `${this.getInstanceKey(instanceId)}:steps`;
  }

  /**
   * 获取 pending 事件哈希键。
   * @param instanceId 实例 ID
   * @returns Redis 键
   */
  private getPendingEventsHashKey(instanceId: string): string {
    return `${this.getInstanceKey(instanceId)}:pending_events`;
  }

  /**
   * 获取错误键。
   * @param instanceId 实例 ID
   * @returns Redis 键
   */
  private getErrorKey(instanceId: string): string {
    return `${this.getInstanceKey(instanceId)}:error`;
  }

  /**
   * 获取输出键。
   * @param instanceId 实例 ID
   * @returns Redis 键
   */
  private getOutputKey(instanceId: string): string {
    return `${this.getInstanceKey(instanceId)}:output`;
  }

  /**
   * 获取事件键。
   * @param instanceId 实例 ID
   * @returns Redis 键
   */
  private getEventKey(instanceId: string): string {
    return `${this.getInstanceKey(instanceId)}:event`;
  }

  /**
   * 获取实例 ZSet 键。
   * @returns Redis 键
   */
  private getInstancesZSetKey(): string {
    return `${this.prefix}:instances`;
  }

  /**
   * 保存实例状态到 Redis。
   * @param instanceId 实例 ID
   * @param state 实例状态详情
   */
  async saveInstance(instanceId: string, state: InstanceInfo): Promise<void> {
    const statusKey = this.getStatusKey(instanceId);
    const errorKey = this.getErrorKey(instanceId);
    const outputKey = this.getOutputKey(instanceId);
    const eventKey = this.getEventKey(instanceId);

    // 并发执行所有独立的 set/del 操作
    const operations: Promise<any>[] = [
      this.client.set(statusKey, this.serialize(state.status)),
      this.client.set(eventKey, this.serialize(state.event)),
    ];

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

    await Promise.all(operations);

    // 计算分数并添加到 ZSet（依赖事件）
    const statusScore = getStatusScore(state.status);
    const timestamp = state.event.timestamp.getTime();
    const score = statusScore * TIME_MULTIPLIER + timestamp;
    await this.client.zadd(this.getInstancesZSetKey(), score, instanceId);
  }

  /**
   * 从 Redis 加载实例状态。
   * @param instanceId 实例 ID
   * @returns 实例状态详情，如果不存在则返回 null
   */
  async loadInstance(instanceId: string): Promise<InstanceInfo | null> {
    const statusStr = await this.client.get(this.getStatusKey(instanceId));
    if (!statusStr) return null;

    const status = this.deserialize(statusStr);

    // 加载其他字段，但不加载步骤状态
    const [errorStr, outputStr, eventStr] = await Promise.all([
      this.client.get(this.getErrorKey(instanceId)),
      this.client.get(this.getOutputKey(instanceId)),
      this.client.get(this.getEventKey(instanceId)),
    ]);

    if (!eventStr) {
      // 无效实例，没有事件数据
      return null;
    }

    const result: InstanceInfo = {
      status,
      event: this.deserialize(eventStr),
    };

    if (errorStr) result.error = this.deserialize(errorStr);
    if (outputStr) result.output = this.deserialize(outputStr);

    return result;
  }

  /**
   * 从 Redis 加载指定步骤的状态。
   * @param instanceId 实例 ID
   * @param stepName 步骤名称
   * @returns 步骤状态，如果不存在则返回 null
   */
  async loadStepState(
    instanceId: string,
    stepName: string,
  ): Promise<StepState | null> {
    const stepStateStr = await this.client.hget(
      this.getStepsHashKey(instanceId),
      stepName,
    );
    if (!stepStateStr) return null;

    return this.deserialize(stepStateStr);
  }

  /**
   * 更新实例状态。
   * @param instanceId 实例 ID
   * @param updates 要更新的字段
   */
  async updateInstance(
    instanceId: string,
    updates: Partial<InstanceInfo>,
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

    // 如果更新了状态，需要更新 ZSet 分数
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

  /**
   * 更新步骤状态。
   * @param instanceId 实例 ID
   * @param stepName 步骤名称
   * @param stepState 步骤状态
   */
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

  /**
   * 删除实例。
   * @param instanceId 实例 ID
   */
  async deleteInstance(instanceId: string): Promise<void> {
    await Promise.all([
      this.client.del(
        this.getStatusKey(instanceId),
        this.getStepsHashKey(instanceId),
        this.getPendingEventsHashKey(instanceId),
        this.getErrorKey(instanceId),
        this.getOutputKey(instanceId),
        this.getEventKey(instanceId),
      ),
      this.client.zrem(this.getInstancesZSetKey(), instanceId),
    ]);
  }

  /**
   * 清理实例的所有步骤状态。
   * @param instanceId 实例 ID
   */
  async clearAllStepStates(instanceId: string): Promise<void> {
    await this.client.del(this.getStepsHashKey(instanceId));
  }

  /**
   * 列出所有实例摘要。
   * @returns 实例摘要列表
   */
  async listInstanceSummaries(): Promise<InstanceSummary[]> {
    // 获取所有实例 ID（按分数排序，从低到高）
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

  /**
   * 列出所有活跃实例 ID。
   * @returns 活跃实例 ID 列表
   */
  async listActiveInstances(): Promise<string[]> {
    // 获取所有活跃实例（分数 >= 2 * TIME_MULTIPLIER）
    const minScore = STATUS_SCORES.active * TIME_MULTIPLIER;
    return await this.client.zrangebyscore(
      this.getInstancesZSetKey(),
      minScore,
      "+inf",
    );
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
    // 只有在字段不存在时才设置（避免覆盖已存在的pending事件）
    await this.client.hsetnx(
      this.getPendingEventsHashKey(instanceId),
      eventType,
      this.serialize(payload),
    );
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
    const payloadStr = await this.client.hget(
      this.getPendingEventsHashKey(instanceId),
      eventType,
    );
    if (!payloadStr) return null;

    // 删除事件
    await this.client.hdel(this.getPendingEventsHashKey(instanceId), eventType);

    return { payload: this.deserialize(payloadStr) };
  }
}
