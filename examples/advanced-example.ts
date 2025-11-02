// advanced-example.ts - 高级示例：展示恢复和事件功能

import type { WorkflowEvent, WorkflowStep } from "../src/index.js";
import { LocalWorkflow, WorkflowEntrypoint } from "../src/index.js";
import { InMemoryWorkflowStorage } from "../src/storages/in-memory.js";

class AdvancedWorkflow extends WorkflowEntrypoint<{}, { task: string }> {
  async run(event: WorkflowEvent<{ task: string }>, step: WorkflowStep) {
    console.log(`Starting advanced workflow for task: ${event.payload.task}`);

    // 步骤1: 初始化
    const initResult = await step.do("initialize", async () => {
      console.log("Initializing...");
      return { initialized: true, task: event.payload.task };
    });

    // 步骤2: 模拟长时间运行的任务
    console.log("Starting long task...");
    await step.sleep("long-task", "1 second");

    const taskResult = await step.do("process-task", async () => {
      console.log(`Processing task: ${initResult.task}`);
      return `Completed: ${initResult.task}`;
    });

    // 步骤3: 等待用户输入
    console.log("Waiting for user confirmation...");
    const userInput = await step.waitForEvent("wait-confirmation", {
      type: "user-confirmation",
      timeout: "10 seconds", // 简化为10秒用于测试
    });

    console.log("Received user input:", userInput);

    // 步骤4: 完成
    const finalResult = await step.do("finalize", async () => {
      return {
        task: taskResult,
        confirmed: userInput,
        completedAt: new Date(),
      };
    });

    return finalResult;
  }
}

async function main() {
  const storage = new InMemoryWorkflowStorage();
  const workflow = new LocalWorkflow<{}, { task: string }>(
    AdvancedWorkflow,
    {},
    storage,
  );

  // 创建实例
  const instance = await workflow.create({
    id: "advanced-test",
    params: { task: "Data Processing" },
  });

  console.log("Created instance:", instance.id);

  // 等待一段时间让工作流开始
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // 检查状态 - 应该在等待事件
  let status = await instance.status();
  console.log("Status after 1.5s:", status.status);

  // 发送事件
  console.log("Sending confirmation event...");
  await instance.sendEvent({
    type: "user-confirmation",
    payload: { approved: true, notes: "Looks good!" },
  });

  // 等待完成
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 检查最终状态
  status = await instance.status();
  console.log("Final status:", status);

  // 演示暂停/恢复
  console.log("\n--- Testing pause/resume ---");
  const instance2 = await workflow.create({
    id: "pause-test",
    params: { task: "Pause Test" },
  });

  await new Promise((resolve) => setTimeout(resolve, 500));
  await instance2.pause();
  console.log("Paused instance status:", await instance2.status());

  await instance2.resume();
  console.log("Resumed instance");

  // 发送事件完成
  await instance2.sendEvent({
    type: "user-confirmation",
    payload: { approved: true },
  });

  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log("Completed instance status:", await instance2.status());
}

main().catch(console.error);
