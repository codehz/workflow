// example.ts - 使用示例

import type { WorkflowEvent, WorkflowStep } from "../src/index.js";
import { LocalWorkflow, WorkflowEntrypoint } from "../src/index.js";
import { InMemoryWorkflowStorage } from "../src/storages/in-memory.js";

// 定义工作流类
class MyWorkflow extends WorkflowEntrypoint<{}, { message: string }> {
  async run(event: WorkflowEvent<{ message: string }>, step: WorkflowStep) {
    console.log("Starting workflow with message:", event.payload.message);

    // 步骤1: 处理消息
    const processed = await step.do("process-message", async () => {
      return `Processed: ${event.payload.message}`;
    });

    console.log("Step 1 result:", processed);

    // 步骤2: 模拟一些工作
    await step.sleep("wait-a-bit", "2 seconds");

    // 步骤3: 等待事件（可选）
    // const eventData = await step.waitForEvent('wait-for-input', { type: 'user-input' });

    // 返回结果
    return { result: processed, timestamp: new Date() };
  }
}

// 使用示例
async function main() {
  // 创建工作流实例，使用内存存储
  const storage = new InMemoryWorkflowStorage();
  const workflow = new LocalWorkflow<{}, { message: string }>(
    MyWorkflow,
    {},
    storage,
  );

  // 创建工作流实例
  const instance = await workflow.create({
    id: "test-instance-1",
    params: { message: "Hello, World!" },
  });

  console.log("Created instance:", instance.id);

  // 等待完成
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // 检查状态
  const status = await instance.status();
  console.log("Final status:", status);

  // 获取实例
  const retrievedInstance = await workflow.get("test-instance-1");
  console.log("Retrieved instance status:", await retrievedInstance.status());
}

// 运行示例
main().catch(console.error);
