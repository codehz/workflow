import { test, expect } from "bun:test";
import { WorkflowEntrypoint, LocalWorkflow, InMemoryWorkflowStorage, NonRetryableError } from "../src/index.js";
import type { WorkflowEvent, WorkflowStep } from "../src/index.js";

// 测试工作流类
class TestWorkflow extends WorkflowEntrypoint<{}, { message: string }> {
  async run(event: WorkflowEvent<{ message: string }>, step: WorkflowStep) {
    const result = await step.do('step1', async () => {
      return `Processed: ${event.payload.message}`;
    });

    await step.sleep('sleep1', 100); // 100ms for testing

    const eventData = await step.waitForEvent('wait1', {
      type: 'test-event',
      timeout: 1000 // 1 second for testing
    });

    return { result, eventData };
  }
}

// 简单工作流类用于基本测试
class SimpleWorkflow extends WorkflowEntrypoint<{}, { value: number }> {
  async run(event: WorkflowEvent<{ value: number }>, step: WorkflowStep) {
    return await step.do('simple', async () => {
      return event.payload.value * 2;
    });
  }
}

// 重试测试工作流
class RetryWorkflow extends WorkflowEntrypoint<{}, {}> {
  private attempts = 0;

  async run(event: WorkflowEvent<{}>, step: WorkflowStep) {
    return await step.do('retry-step', {
      retries: { limit: 2, delay: 50 }
    }, async () => {
      this.attempts++;
      if (this.attempts < 3) {
        throw new Error('Temporary failure');
      }
      return 'success';
    });
  }
}

// 非重试错误测试
class NonRetryWorkflow extends WorkflowEntrypoint<{}, {}> {
  async run(event: WorkflowEvent<{}>, step: WorkflowStep) {
    return await step.do('non-retry-step', async () => {
      throw new NonRetryableError('Non-retryable error');
    });
  }
}

test("创建工作流实例", async () => {
  const workflow = new LocalWorkflow(SimpleWorkflow);
  const instance = await workflow.create({
    params: { value: 5 }
  });

  expect(instance.id).toBeDefined();
  expect(typeof instance.id).toBe('string');
});

test("执行简单工作流", async () => {
  const workflow = new LocalWorkflow(SimpleWorkflow);
  const instance = await workflow.create({
    params: { value: 10 }
  });

  // 等待完成
  await new Promise(resolve => setTimeout(resolve, 100));

  const status = await instance.status();
  expect(status.status).toBe('complete');
  expect(status.output).toBe(20);
});

test("工作流步骤执行和睡眠", async () => {
  const workflow = new LocalWorkflow(TestWorkflow);
  const instance = await workflow.create({
    params: { message: "test" }
  });

  // 发送事件以完成工作流
  setTimeout(() => {
    instance.sendEvent({ type: 'test-event', payload: 'event-data' });
  }, 200);

  // 等待完成
  await new Promise(resolve => setTimeout(resolve, 500));

  const status = await instance.status();
  expect(status.status).toBe('complete');
  expect(status.output.result).toBe('Processed: test');
  expect(status.output.eventData).toBe('event-data');
});

test("等待事件超时", async () => {
  const workflow = new LocalWorkflow(TestWorkflow);
  const instance = await workflow.create({
    params: { message: "timeout-test" }
  });

  // 不发送事件，让它超时
  await new Promise(resolve => setTimeout(resolve, 1500));

  const status = await instance.status();
  expect(status.status).toBe('errored');
  expect(status.error).toContain('Timeout');
});

test("暂停和恢复工作流", async () => {
  const workflow = new LocalWorkflow(SimpleWorkflow);
  const instance = await workflow.create({
    params: { value: 3 }
  });

  // 暂停
  await instance.pause();
  let status = await instance.status();
  expect(status.status).toBe('paused');

  // 恢复
  await instance.resume();
  status = await instance.status();
  expect(status.status).toBe('complete');
  expect(status.output).toBe(6);
});

test("终止工作流", async () => {
  const workflow = new LocalWorkflow(TestWorkflow);
  const instance = await workflow.create({
    params: { message: "terminate-test" }
  });

  // 终止
  await instance.terminate();
  const status = await instance.status();
  expect(status.status).toBe('terminated');
});

test("重启工作流", async () => {
  const workflow = new LocalWorkflow(SimpleWorkflow);
  const instance = await workflow.create({
    params: { value: 4 }
  });

  // 等待完成
  await new Promise(resolve => setTimeout(resolve, 100));
  let status = await instance.status();
  expect(status.status).toBe('complete');
  expect(status.output).toBe(8);

  // 重启
  await instance.restart();

  // 等待重新完成
  await new Promise(resolve => setTimeout(resolve, 200));
  status = await instance.status();
  expect(status.status).toBe('complete');
  expect(status.output).toBe(8); // 同样的输入应该得到同样的输出
});

test("步骤重试机制", async () => {
  const workflow = new LocalWorkflow(RetryWorkflow);
  const instance = await workflow.create();

  // 等待完成（包括重试）
  await new Promise(resolve => setTimeout(resolve, 500));

  const status = await instance.status();
  expect(status.status).toBe('complete');
  expect(status.output).toBe('success');
});

test("非重试错误", async () => {
  const workflow = new LocalWorkflow(NonRetryWorkflow);
  const instance = await workflow.create();

  // 等待失败
  await new Promise(resolve => setTimeout(resolve, 100));

  const status = await instance.status();
  expect(status.status).toBe('errored');
  expect(status.error).toBe('Non-retryable error');
});

test("批量创建实例", async () => {
  const workflow = new LocalWorkflow(SimpleWorkflow);
  const instances = await workflow.createBatch([
    { params: { value: 1 } },
    { params: { value: 2 } },
    { params: { value: 3 } }
  ]);

  expect(instances).toHaveLength(3);
  instances.forEach(instance => {
    expect(instance.id).toBeDefined();
  });

  // 等待所有完成
  await new Promise(resolve => setTimeout(resolve, 200));

  for (const instance of instances) {
    const status = await instance.status();
    expect(status.status).toBe('complete');
  }
});

test("获取工作流实例", async () => {
  const workflow = new LocalWorkflow(SimpleWorkflow);
  const instance1 = await workflow.create({
    id: 'test-get-instance',
    params: { value: 7 }
  });

  const instance2 = await workflow.get('test-get-instance');
  expect(instance2.id).toBe('test-get-instance');

  // 等待完成
  await new Promise(resolve => setTimeout(resolve, 100));
  const status = await instance2.status();
  expect(status.status).toBe('complete');
  expect(status.output).toBe(14);
});

test("内存存储功能", async () => {
  const storage = new InMemoryWorkflowStorage();

  // 保存实例
  await storage.saveInstance('test-id', {
    status: 'running',
    output: 'test-output'
  });

  // 加载实例
  const loaded = await storage.loadInstance('test-id');
  expect(loaded).not.toBeNull();
  expect(loaded!.status).toBe('running');
  expect(loaded!.output).toBe('test-output');

  // 列出实例
  const list = await storage.listInstances();
  expect(list).toContain('test-id');

  // 删除实例
  await storage.deleteInstance('test-id');
  const afterDelete = await storage.loadInstance('test-id');
  expect(afterDelete).toBeNull();
});

test("自定义实例ID", async () => {
  const workflow = new LocalWorkflow(SimpleWorkflow);
  const instance = await workflow.create({
    id: 'custom-id-123',
    params: { value: 9 }
  });

  expect(instance.id).toBe('custom-id-123');

  // 验证可以通过get获取
  const retrieved = await workflow.get('custom-id-123');
  expect(retrieved.id).toBe('custom-id-123');
});