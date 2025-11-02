import { expect, test } from "bun:test";
import { InMemoryWorkflowStorage } from "../src/index.js";

test("内存存储功能", async () => {
  const storage = new InMemoryWorkflowStorage();

  // 保存实例
  await storage.saveInstance("test-id", {
    status: "running",
    output: "test-output",
  });

  // 加载实例
  const loaded = await storage.loadInstance("test-id");
  expect(loaded).not.toBeNull();
  expect(loaded!.status).toBe("running");
  expect(loaded!.output).toBe("test-output");

  // 列出实例
  const list = await storage.listInstanceSummaries();
  expect(list.some((item) => item.id === "test-id")).toBe(true);

  // 删除实例
  await storage.deleteInstance("test-id");
  const afterDelete = await storage.loadInstance("test-id");
  expect(afterDelete).toBeNull();

  // 再次列出实例，确保为空
  const listAfterDelete = await storage.listInstanceSummaries();
  expect(listAfterDelete).toEqual([]);
});
