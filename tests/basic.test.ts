import { expect, test } from "bun:test";
import type { WorkflowEvent, WorkflowStep } from "../src/index.js";
import { LocalWorkflow, WorkflowEntrypoint } from "../src/index.js";

// 简单工作流类用于基本测试
class SimpleWorkflow extends WorkflowEntrypoint<
  {},
  { value: number },
  Record<string, any>,
  number
> {
  async run(event: WorkflowEvent<{ value: number }>, step: WorkflowStep) {
    return await step.do("simple", async () => {
      return event.payload.value * 2;
    });
  }
}

// 测试工作流类
class TestWorkflow extends WorkflowEntrypoint<
  {},
  { message: string },
  { "test-event": string },
  { result: string; eventData: string }
> {
  async run(
    event: WorkflowEvent<{ message: string }>,
    step: WorkflowStep<{ "test-event": string }>,
  ) {
    const result = await step.do("step1", async () => {
      return `Processed: ${event.payload.message}`;
    });

    await step.sleep("sleep1", 100); // 100ms for testing

    const eventData = await step.waitForEvent("wait1", {
      type: "test-event",
      timeout: 1000, // 1 second for testing
    });

    return { result, eventData };
  }
}

test("创建工作流实例", async () => {
  const workflow = new LocalWorkflow(SimpleWorkflow);
  const instance = await workflow.create({
    params: { value: 5 },
  });

  expect(instance.id).toBeDefined();
  expect(typeof instance.id).toBe("string");
});

test("执行简单工作流", async () => {
  const workflow = new LocalWorkflow(SimpleWorkflow);
  const instance = await workflow.create({
    params: { value: 10 },
  });

  // 等待完成
  await new Promise((resolve) => setTimeout(resolve, 100));

  const status = await instance.status();
  expect(status.status).toBe("complete");
  expect(status.output).toBe(20);
});

test("暂停和恢复工作流", async () => {
  const workflow = new LocalWorkflow(SimpleWorkflow);
  const instance = await workflow.create({
    params: { value: 3 },
  });

  // 暂停
  await instance.pause();
  let status = await instance.status();
  expect(status.status).toBe("paused");

  // 恢复
  await instance.resume();
  status = await instance.status();
  expect(status.status).toBe("complete");
  expect(status.output).toBe(6);
});

test("终止工作流", async () => {
  const workflow = new LocalWorkflow(TestWorkflow);
  const instance = await workflow.create({
    params: { message: "terminate-test" },
  });

  // 终止
  await instance.terminate();
  const status = await instance.status();
  expect(status.status).toBe("terminated");
});

test("重启工作流", async () => {
  const workflow = new LocalWorkflow(SimpleWorkflow);
  const instance = await workflow.create({
    params: { value: 4 },
  });

  // 等待完成
  await new Promise((resolve) => setTimeout(resolve, 100));
  let status = await instance.status();
  expect(status.status).toBe("complete");
  expect(status.output).toBe(8);

  // 重启
  await instance.restart();

  // 等待重新完成
  await new Promise((resolve) => setTimeout(resolve, 200));

  status = await instance.status();
  expect(status.status).toBe("complete");
  expect(status.output).toBe(8); // 同样的输入应该得到同样的输出
});

test("自定义实例ID", async () => {
  const workflow = new LocalWorkflow(SimpleWorkflow);
  const instance = await workflow.create({
    id: "custom-id-123",
    params: { value: 9 },
  });

  expect(instance.id).toBe("custom-id-123");

  // 验证可以通过get获取
  const retrieved = await workflow.get("custom-id-123");
  expect(retrieved.id).toBe("custom-id-123");
});

test("获取工作流实例", async () => {
  const workflow = new LocalWorkflow(SimpleWorkflow);
  await workflow.create({
    id: "test-get-instance",
    params: { value: 7 },
  });

  const instance2 = await workflow.get("test-get-instance");
  expect(instance2.id).toBe("test-get-instance");

  // 等待完成
  await new Promise((resolve) => setTimeout(resolve, 100));
  const status = await instance2.status();
  expect(status.status).toBe("complete");
  expect(status.output).toBe(14);
});

// 测试恢复未完成的工作流
class PausableWorkflow extends WorkflowEntrypoint<
  {},
  { value: number },
  Record<string, any>,
  number
> {
  async run(event: WorkflowEvent<{ value: number }>, step: WorkflowStep) {
    const result1 = await step.do("step1", async () => {
      return event.payload.value * 2;
    });

    await step.sleep("sleep1", 200); // 睡眠200ms

    const result2 = await step.do("step2", async () => {
      return result1 + 10;
    });

    return result2;
  }
}

test("恢复未完成的工作流", async () => {
  const storage = new (
    await import("../src/storages/in-memory.js")
  ).InMemoryWorkflowStorage();
  const workflow = new LocalWorkflow(PausableWorkflow, {}, storage);

  // 创建实例并暂停（在睡眠期间）
  const instance = await workflow.create({
    id: "test-recover-unfinished",
    params: { value: 5 },
  });

  // 等待 step1 完成，但睡眠中途暂停
  await new Promise((resolve) => setTimeout(resolve, 50)); // step1 完成，睡眠开始

  // 暂停实例
  await instance.pause();

  let status = await instance.status();
  expect(status.status).toBe("paused");

  // 模拟重启：创建新的 workflow 实例
  const workflow2 = new LocalWorkflow(PausableWorkflow, {}, storage);

  // 调用 recover，应该恢复暂停的实例
  await workflow2.recover();

  // 等待恢复和完成
  await new Promise((resolve) => setTimeout(resolve, 200));

  const instance2 = await workflow2.get("test-recover-unfinished");
  status = await instance2.status();
  expect(status.status).toBe("complete");
  expect(status.output).toBe(20); // 5*2 + 10 = 20
});

test("WorkflowEntrypoint.create 与直接继承效果一致", async () => {
  // 定义环境和参数类型
  type Env = { multiplier: number };
  type Params = { value: number };
  type EventMap = Record<string, any>;
  type Result = number;

  // 定义函数
  const fn = async function (
    this: Env,
    event: WorkflowEvent<Params>,
    step: WorkflowStep<EventMap>,
  ): Promise<Result> {
    return await step.do("test", async () => {
      return event.payload.value * this.multiplier;
    });
  };

  // 使用 create 创建类
  const CreatedWorkflow = WorkflowEntrypoint.create<
    Env,
    Params,
    EventMap,
    Result
  >(fn);

  // 直接继承的类
  class DirectWorkflow extends WorkflowEntrypoint<
    Env,
    Params,
    EventMap,
    Result
  > {
    async run(
      event: WorkflowEvent<Params>,
      step: WorkflowStep<EventMap>,
    ): Promise<Result> {
      return await step.do("test", async () => {
        return event.payload.value * this.env.multiplier;
      });
    }
  }

  // Mock step
  const mockStep = {
    do: async (_name: string, callback: () => Promise<any>) => {
      return await callback();
    },
  } as WorkflowStep<EventMap>;

  // Mock event
  const mockEvent: WorkflowEvent<Params> = {
    payload: { value: 10 },
    timestamp: new Date(),
    instanceId: "test-instance",
  };

  // 环境
  const env: Env = { multiplier: 3 };

  // 创建实例
  const createdInstance = new CreatedWorkflow(env);
  const directInstance = new DirectWorkflow(env);

  // 运行并比较结果
  const createdResult = await createdInstance.run(mockEvent, mockStep);
  const directResult = await directInstance.run(mockEvent, mockStep);

  expect(createdResult).toBe(directResult);
  expect(createdResult).toBe(30); // 10 * 3
});
