import { test, expect } from "bun:test";
import { WorkflowEntrypoint, LocalWorkflow } from "../src/index.js";
import type { WorkflowEvent, WorkflowStep } from "../src/index.js";

// 简单工作流类用于批量测试
class SimpleWorkflow extends WorkflowEntrypoint<{}, { value: number }> {
  async run(event: WorkflowEvent<{ value: number }>, step: WorkflowStep) {
    return await step.do("simple", async () => {
      return event.payload.value * 2;
    });
  }
}

test("批量创建实例", async () => {
  const workflow = new LocalWorkflow(SimpleWorkflow);
  const instances = await workflow.createBatch([
    { params: { value: 1 } },
    { params: { value: 2 } },
    { params: { value: 3 } },
  ]);

  expect(instances).toHaveLength(3);
  instances.forEach((instance) => {
    expect(instance.id).toBeDefined();
  });

  // 等待所有完成
  await new Promise((resolve) => setTimeout(resolve, 200));

  for (const instance of instances) {
    const status = await instance.status();
    expect(status.status).toBe("complete");
  }
});
