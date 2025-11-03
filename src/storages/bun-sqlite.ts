import { Database } from "bun:sqlite";

import type {
  InstanceInfo,
  InstanceSummary,
  StepState,
  WorkflowStorage,
} from "../types.js";

/**
 * 基于 Bun 的 SQLite 工作流存储实现。
 * 使用 SQLite 数据库存储工作流实例的状态、步骤、错误、输出和事件。
 * 支持实例的保存、加载、更新、删除和列表查询。
 */
export class BunSQLiteWorkflowStorage implements WorkflowStorage {
  /**
   * 构造函数。
   * @param db SQLite 数据库实例
   * @param prefix 表名前缀
   * @param serialize 序列化函数，默认使用 JSON.stringify
   * @param deserialize 反序列化函数，默认使用 JSON.parse
   */
  constructor(
    private db: Database,
    private prefix: string = "workflow",
    private serialize: (obj: any) => string = JSON.stringify,
    private deserialize: (str: string) => any = JSON.parse,
  ) {
    this.initializeTables();
  }

  /**
   * 初始化数据库表。
   */
  private initializeTables(): void {
    // 创建实例表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS ${this.getTableName("instances")} (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        error TEXT,
        output TEXT,
        event TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    // 创建步骤表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS ${this.getTableName("steps")} (
        instance_id TEXT NOT NULL,
        step_name TEXT NOT NULL,
        step_state TEXT NOT NULL,
        PRIMARY KEY (instance_id, step_name),
        FOREIGN KEY (instance_id) REFERENCES ${this.getTableName("instances")} (id) ON DELETE CASCADE
      );
    `);

    // 创建 pending 事件表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS ${this.getTableName("pending_events")} (
        instance_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        PRIMARY KEY (instance_id, event_type),
        FOREIGN KEY (instance_id) REFERENCES ${this.getTableName("instances")} (id) ON DELETE CASCADE
      );
    `);

    // 启用 WAL 模式以提高性能
    this.db.run("PRAGMA journal_mode = WAL;");
  }

  /**
   * 获取安全的表名。
   * @param table 表名
   * @returns 安全的表名
   */
  private getTableName(table: string): string {
    const safePrefix = this.prefix.replace(/[^a-zA-Z0-9_]/g, "_");
    return `${safePrefix}_${table}`;
  }

  /**
   * 保存实例状态到 SQLite。
   * @param instanceId 实例 ID
   * @param state 实例状态详情
   */
  async saveInstance(instanceId: string, state: InstanceInfo): Promise<void> {
    const createdAt = state.event.timestamp.getTime();

    // 插入或替换实例
    const insertInstance = this.db.prepare(`
      INSERT OR REPLACE INTO ${this.getTableName("instances")} (id, status, error, output, event, created_at)
      VALUES (?, ?, ?, ?, ?, ?);
    `);

    insertInstance.run(
      instanceId,
      state.status,
      state.error ? this.serialize(state.error) : null,
      state.output ? this.serialize(state.output) : null,
      this.serialize(state.event),
      createdAt,
    );
  }

  /**
   * 从 SQLite 加载实例状态。
   * @param instanceId 实例 ID
   * @returns 实例状态详情，如果不存在或无效则返回 null
   */
  async loadInstance(instanceId: string): Promise<InstanceInfo | null> {
    const selectInstance = this.db.prepare(`
      SELECT status, error, output, event FROM ${this.getTableName("instances")} WHERE id = ?;
    `);
    const instanceRow = selectInstance.get(instanceId) as any;

    if (!instanceRow) return null;

    const event = this.deserialize(instanceRow.event);
    if (!event) return null; // 无效实例

    const result: InstanceInfo = {
      status: instanceRow.status,
      event,
    };

    if (instanceRow.error) result.error = this.deserialize(instanceRow.error);
    if (instanceRow.output)
      result.output = this.deserialize(instanceRow.output);

    return result;
  }

  /**
   * 从 SQLite 加载指定步骤的状态。
   * @param instanceId 实例 ID
   * @param stepName 步骤名称
   * @returns 步骤状态，如果不存在则返回 null
   */
  async loadStepState(
    instanceId: string,
    stepName: string,
  ): Promise<StepState | null> {
    const selectStep = this.db.prepare(`
      SELECT step_state FROM ${this.getTableName("steps")} WHERE instance_id = ? AND step_name = ?;
    `);
    const row = selectStep.get(instanceId, stepName) as any;

    if (!row) return null;

    return this.deserialize(row.step_state);
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
    const setParts: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) {
      setParts.push("status = ?");
      values.push(updates.status);
    }

    if (updates.error !== undefined) {
      setParts.push("error = ?");
      values.push(updates.error ? this.serialize(updates.error) : null);
    }

    if (updates.output !== undefined) {
      setParts.push("output = ?");
      values.push(updates.output ? this.serialize(updates.output) : null);
    }

    if (updates.event !== undefined) {
      setParts.push("event = ?");
      values.push(this.serialize(updates.event));
    }

    if (setParts.length > 0) {
      const updateQuery = `
        UPDATE ${this.getTableName("instances")}
        SET ${setParts.join(", ")}
        WHERE id = ?;
      `;
      values.push(instanceId);
      const updateStmt = this.db.prepare(updateQuery);
      updateStmt.run(...values);
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
    const upsertStep = this.db.prepare(`
      INSERT OR REPLACE INTO ${this.getTableName("steps")} (instance_id, step_name, step_state)
      VALUES (?, ?, ?);
    `);
    upsertStep.run(instanceId, stepName, this.serialize(stepState));
  }

  /**
   * 删除实例。
   * @param instanceId 实例 ID
   */
  async deleteInstance(instanceId: string): Promise<void> {
    // 由于外键约束，删除实例时步骤会自动删除
    const deleteInstance = this.db.prepare(`
      DELETE FROM ${this.getTableName("instances")} WHERE id = ?;
    `);
    deleteInstance.run(instanceId);
  }

  /**
   * 清理实例的所有步骤状态。
   * @param instanceId 实例 ID
   */
  async clearAllStepStates(instanceId: string): Promise<void> {
    const deleteSteps = this.db.prepare(`
      DELETE FROM ${this.getTableName("steps")} WHERE instance_id = ?;
    `);
    deleteSteps.run(instanceId);
  }

  /**
   * 列出所有实例摘要。
   * @returns 实例摘要列表，按创建时间排序
   */
  async listInstanceSummaries(): Promise<InstanceSummary[]> {
    const selectSummaries = this.db.prepare(`
      SELECT id, status FROM ${this.getTableName("instances")} ORDER BY created_at ASC;
    `);
    const rows = selectSummaries.all() as any[];
    return rows.map((row) => ({ id: row.id, status: row.status }));
  }

  /**
   * 列出所有活跃实例 ID。
   * @returns 活跃实例 ID 列表（状态不是 terminated 或 complete）
   */
  async listActiveInstances(): Promise<string[]> {
    const selectActive = this.db.prepare(`
      SELECT id FROM ${this.getTableName("instances")}
      WHERE status != 'terminated' AND status != 'complete'
      ORDER BY created_at ASC;
    `);
    const rows = selectActive.all() as any[];
    return rows.map((row) => row.id);
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
    const upsertEvent = this.db.prepare(`
      INSERT OR IGNORE INTO ${this.getTableName("pending_events")} (instance_id, event_type, payload)
      VALUES (?, ?, ?);
    `);
    upsertEvent.run(instanceId, eventType, this.serialize(payload));
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
    const selectEvent = this.db.prepare(`
      SELECT payload FROM ${this.getTableName("pending_events")}
      WHERE instance_id = ? AND event_type = ?;
    `);
    const row = selectEvent.get(instanceId, eventType) as any;

    if (!row) return null;

    // 删除事件
    const deleteEvent = this.db.prepare(`
      DELETE FROM ${this.getTableName("pending_events")}
      WHERE instance_id = ? AND event_type = ?;
    `);
    deleteEvent.run(instanceId, eventType);

    return { payload: this.deserialize(row.payload) };
  }
}
