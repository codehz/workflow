import { test, expect } from "bun:test";
import { WorkflowEntrypoint, LocalWorkflow } from "../src/index.js";
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

// 嵌套步骤测试工作流
class NestedStepWorkflow extends WorkflowEntrypoint<{}, { result: string }> {
  async run(event: WorkflowEvent<{}>, step: WorkflowStep) {
    return await step.do('outer-step', async () => {
      const innerResult = await step.do('inner-step', async () => {
        return 'inner result';
      });
      return { result: `outer with ${innerResult}` };
    });
  }
}

// 并行步骤测试工作流
class ParallelStepWorkflow extends WorkflowEntrypoint<{}, { results: number[] }> {
  async run(event: WorkflowEvent<{}>, step: WorkflowStep) {
    const results = await Promise.all([
      step.do('step1', async () => 1),
      step.do('step2', async () => 2),
      step.do('step3', async () => 3)
    ]);
    return { results };
  }
}

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

test("嵌套使用 step.do", async () => {
  const workflow = new LocalWorkflow(NestedStepWorkflow);
  const instance = await workflow.create();

  // 等待完成
  await new Promise(resolve => setTimeout(resolve, 100));

  const status = await instance.status();
  expect(status.status).toBe('complete');
  expect(status.output.result).toBe('outer with inner result');
});

test("工作流中使用 Promise.all 等待多个步骤", async () => {
  const workflow = new LocalWorkflow(ParallelStepWorkflow);
  const instance = await workflow.create();

  // 等待完成
  await new Promise(resolve => setTimeout(resolve, 100));

  const status = await instance.status();
  expect(status.status).toBe('complete');
  expect(status.output.results).toEqual([1, 2, 3]);
});