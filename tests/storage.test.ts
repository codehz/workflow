import { redis } from "bun";
import { expect, test } from "bun:test";
import { BunRedisWorkflowStorage } from "../src/storages/bun-redis.js";
import { BunSQLiteWorkflowStorage } from "../src/storages/bun-sqlite.js";
import { InMemoryWorkflowStorage } from "../src/storages/in-memory.js";

// 检查Redis是否可用
async function isRedisAvailable(): Promise<boolean> {
  try {
    // 设置一个短超时来快速检查Redis是否可用
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Redis ping timeout")), 1000),
    );
    await Promise.race([redis.ping(), timeoutPromise]);
    return true;
  } catch (error) {
    return false;
  }
}

const redisAvailable = await isRedisAvailable();

test("内存存储功能", async () => {
  const storage = new InMemoryWorkflowStorage();

  const event = {
    payload: {},
    timestamp: new Date("2025-01-01T00:00:00Z"),
    instanceId: "test-id",
  };

  // 保存实例
  await storage.saveInstance("test-id", {
    status: "running",
    event,
    stepStates: {},
  });

  // 加载实例
  const loaded = await storage.loadInstance("test-id");
  expect(loaded).not.toBeNull();
  expect(loaded!.status).toBe("running");
  expect(loaded!.stepStates).toEqual({});
  expect(loaded!.event.instanceId).toBe("test-id");
  expect(loaded!.event.payload).toEqual({});

  // 更新实例
  await storage.updateInstance("test-id", { status: "complete" });
  const updated = await storage.loadInstance("test-id");
  expect(updated!.status).toBe("complete");

  // 更新步骤状态
  await storage.updateStepState("test-id", "step1", {
    status: "completed",
    result: "step-result",
  });
  const withStep = await storage.loadInstance("test-id");
  expect(withStep!.stepStates!["step1"]).toEqual({
    status: "completed",
    result: "step-result",
  });

  // 列出实例
  const list = await storage.listInstanceSummaries();
  expect(list.some((item) => item.id === "test-id")).toBe(true);

  // 列出活跃实例
  const active = await storage.listActiveInstances();
  expect(active).toEqual([]); // 因为status是complete

  // 删除实例
  await storage.deleteInstance("test-id");
  const afterDelete = await storage.loadInstance("test-id");
  expect(afterDelete).toBeNull();

  // 再次列出实例，确保为空
  const listAfterDelete = await storage.listInstanceSummaries();
  expect(listAfterDelete).toEqual([]);
});

test.skipIf(!redisAvailable)("Bun Redis存储功能", async () => {
  const storage = new BunRedisWorkflowStorage(redis, "test-storage");

  // 清空测试数据
  const keys = await redis.send("KEYS", ["test-storage:*"]);
  if (keys.length > 0) {
    await redis.del(...keys);
  }

  const event = {
    payload: {},
    timestamp: new Date("2025-01-01T00:00:00Z"),
    instanceId: "test-id",
  };

  // 保存实例
  await storage.saveInstance("test-id", {
    status: "running",
    event,
    stepStates: {},
  });

  // 加载实例
  const loaded = await storage.loadInstance("test-id");
  expect(loaded).not.toBeNull();
  expect(loaded!.status).toBe("running");
  expect(loaded!.stepStates).toEqual({});
  expect(loaded!.event.instanceId).toBe("test-id");
  expect(loaded!.event.payload).toEqual({});

  // 更新实例
  await storage.updateInstance("test-id", { status: "complete" });
  const updated = await storage.loadInstance("test-id");
  expect(updated!.status).toBe("complete");

  // 更新步骤状态
  await storage.updateStepState("test-id", "step1", {
    status: "completed",
    result: "step-result",
  });
  const withStep = await storage.loadInstance("test-id");
  expect(withStep!.stepStates!["step1"]).toEqual({
    status: "completed",
    result: "step-result",
  });

  // 列出实例
  const list = await storage.listInstanceSummaries();
  expect(list.some((item) => item.id === "test-id")).toBe(true);

  // 列出活跃实例
  const active = await storage.listActiveInstances();
  expect(active).toEqual([]); // 因为status是complete

  // 删除实例
  await storage.deleteInstance("test-id");
  const afterDelete = await storage.loadInstance("test-id");
  expect(afterDelete).toBeNull();

  // 再次列出实例，确保为空
  const listAfterDelete = await storage.listInstanceSummaries();
  expect(listAfterDelete).toEqual([]);
});

test("Bun SQLite存储功能", async () => {
  const { Database } = await import("bun:sqlite");
  const db = new Database(":memory:");
  const storage = new BunSQLiteWorkflowStorage(db, "test-storage");

  const event = {
    payload: {},
    timestamp: new Date("2025-01-01T00:00:00Z"),
    instanceId: "test-id",
  };

  // 保存实例
  await storage.saveInstance("test-id", {
    status: "running",
    event,
    stepStates: {},
  });

  // 加载实例
  const loaded = await storage.loadInstance("test-id");
  expect(loaded).not.toBeNull();
  expect(loaded!.status).toBe("running");
  expect(loaded!.stepStates).toEqual({});
  expect(loaded!.event.instanceId).toBe("test-id");
  expect(loaded!.event.payload).toEqual({});

  // 更新实例
  await storage.updateInstance("test-id", { status: "complete" });
  const updated = await storage.loadInstance("test-id");
  expect(updated!.status).toBe("complete");

  // 更新步骤状态
  await storage.updateStepState("test-id", "step1", {
    status: "completed",
    result: "step-result",
  });
  const withStep = await storage.loadInstance("test-id");
  expect(withStep!.stepStates!["step1"]).toEqual({
    status: "completed",
    result: "step-result",
  });

  // 列出实例
  const list = await storage.listInstanceSummaries();
  expect(list.some((item) => item.id === "test-id")).toBe(true);

  // 列出活跃实例
  const active = await storage.listActiveInstances();
  expect(active).toEqual([]); // 因为status是complete

  // 删除实例
  await storage.deleteInstance("test-id");
  const afterDelete = await storage.loadInstance("test-id");
  expect(afterDelete).toBeNull();

  // 再次列出实例，确保为空
  const listAfterDelete = await storage.listInstanceSummaries();
  expect(listAfterDelete).toEqual([]);
});
