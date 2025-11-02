// recover-example.ts - 自动恢复示例

import { WorkflowEntrypoint, LocalWorkflow, InMemoryWorkflowStorage } from '../src/index.js';
import type { WorkflowEvent, WorkflowStep } from '../src/index.js';

// 定义工作流类
class RecoverableWorkflow extends WorkflowEntrypoint<{}, { value: number }> {
  async run(event: WorkflowEvent<{ value: number }>, step: WorkflowStep) {
    console.log('Starting workflow with value:', event.payload.value);

    // 步骤1: 计算
    const result1 = await step.do('calculate', async () => {
      return event.payload.value * 2;
    });

    console.log('Step 1 result:', result1);

    // 步骤2: 睡眠
    await step.sleep('sleep', '1 second');

    // 步骤3: 最终计算
    const result2 = await step.do('finalize', async () => {
      return result1 + 10;
    });

    console.log('Final result:', result2);
    return result2;
  }
}

// 使用示例
async function main() {
  // 创建共享存储
  const storage = new InMemoryWorkflowStorage();

  // 第一次运行：创建工作流实例
  console.log('=== First run ===');
  const workflow1 = new LocalWorkflow<{}, { value: number }>(RecoverableWorkflow, {}, storage);

  const instance1 = await workflow1.create({
    id: 'recover-test',
    params: { value: 5 }
  });

  console.log('Created instance:', instance1.id);

  // 等待一会儿，让工作流开始执行
  await new Promise(resolve => setTimeout(resolve, 500));

  // 检查状态（应该在睡眠中）
  let status = await instance1.status();
  console.log('Status after 500ms:', status.status);

  // 模拟应用关闭（shutdown）
  console.log('\n=== Simulating app shutdown ===');
  await workflow1.shutdown();
  console.log('Workflow shutdown completed');

  // 模拟应用重启
  console.log('\n=== Simulating app restart ===');

  // 创建新的工作流实例，使用相同的存储
  const workflow2 = new LocalWorkflow<{}, { value: number }>(RecoverableWorkflow, {}, storage);

  // 自动恢复所有未完成的工作流
  console.log('Recovering workflows...');
  await workflow2.recover();

  // 等待恢复完成
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 检查恢复后的状态
  const instance2 = await workflow2.get('recover-test');
  status = await instance2.status();
  console.log('Status after recovery:', status);
  console.log('Final output:', status.output); // 应该等于 5*2 + 10 = 20
}

// 运行示例
main().catch(console.error);