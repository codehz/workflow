import { expect, test } from "bun:test";
import { WorkflowEntrypoint } from "../src/types.js";
import { LocalWorkflow } from "../src/workflow.js";

class TestWorkflow extends WorkflowEntrypoint<any, any, any, void> {
  async run(_event: any, step: any) {
    await step.do("step1", async () => {
      console.log("Executing step1");
      return "result1";
    });

    await step.sleep("sleep1", 100);

    await step.do("step2", async () => {
      console.log("Executing step2");
      return "result2";
    });
  }
}

test("shutdown 停止工作流执行", async () => {
  const workflow = new LocalWorkflow(TestWorkflow);

  // 创建一个实例
  const instance = await workflow.create();

  // 立即关闭
  await workflow.shutdown();

  // 实例应该抛出异常，因为 executor 已关闭
  expect(instance.status()).rejects.toThrow("Executor is shutdown");
});
