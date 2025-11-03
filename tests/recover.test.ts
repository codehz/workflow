import { expect, test } from "bun:test";
import { LocalWorkflow } from "../src/index.js";
import { InMemoryWorkflowStorage } from "../src/storages/in-memory.js";
import { WorkflowEntrypoint } from "../src/types.js";

class RecoverWorkflow extends WorkflowEntrypoint<any, any, any, string> {
  async run(_event: any, step: any) {
    await step.do("step1", async () => {
      console.log("Executing step1");
      return "result1";
    });

    await step.sleep("sleep1", 200); // 200ms sleep

    await step.do("step2", async () => {
      console.log("Executing step2");
      return "result2";
    });

    return "completed";
  }
}

test("recover 恢复由于shutdown终止的工作流", async () => {
  // 创建共享存储
  const storage = new InMemoryWorkflowStorage();

  // 创建第一个工作流实例
  const workflow1 = new LocalWorkflow(RecoverWorkflow, {}, storage);

  // 创建实例
  const instance = await workflow1.create({
    id: "recover-shutdown-test",
  });

  // 等待 step1 完成，但 sleep1 还没完成
  await new Promise((resolve) => setTimeout(resolve, 50));

  // 检查状态，应该在 sleep1 中
  let status = await instance.status();
  expect(status.status).toBe("running");
  expect(status.stepStates?.["step1"]?.status).toBe("completed");

  // 调用 shutdown，终止工作流
  await workflow1.shutdown();

  // 现在，原来的实例操作会挂起，所以我们不调用它

  // 创建新的工作流实例，使用相同的存储
  const workflow2 = new LocalWorkflow(RecoverWorkflow, {}, storage);

  // 调用 recover 恢复工作流
  await workflow2.recover();

  // 等待恢复完成（sleep1 剩余时间 + step2）
  await new Promise((resolve) => setTimeout(resolve, 300));

  // 获取恢复后的实例
  const recoveredInstance = await workflow2.get("recover-shutdown-test");

  // 检查最终状态
  status = await recoveredInstance.status();
  expect(status.status).toBe("complete");
  expect(status.output).toBe("completed");
  expect(status.stepStates?.["step1"]?.status).toBe("completed");
  expect(status.stepStates?.["step2"]?.status).toBe("completed");
});
