import { expect, test } from "bun:test";
import { WorkflowEntrypoint } from "../src/types.js";
import { LocalWorkflow } from "../src/workflow.js";

class TestWorkflow extends WorkflowEntrypoint<any, any, any, void> {
  async run(event: any, step: any) {
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

  // 实例应该处于操作被阻塞的状态
  // 因为关闭禁用了存储，任何进一步的操作都会无限等待
  const statusPromise = instance.status();

  // 使用 Promise.race 来验证 status() 会挂起（永不resolve）
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () =>
        reject(new Error("Expected infinite wait, but operation completed")),
      100,
    ),
  );

  // 如果 status() 在100ms内完成，就抛出错误（因为它应该无限等待）
  await expect(Promise.race([statusPromise, timeoutPromise])).rejects.toThrow(
    "Expected infinite wait, but operation completed",
  );
});
