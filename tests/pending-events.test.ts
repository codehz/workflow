import { expect, test } from "bun:test";
import type { WorkflowEvent, WorkflowStep } from "../src/index.js";
import { LocalWorkflow, WorkflowEntrypoint } from "../src/index.js";

// 测试工作流类 - 等待单个事件
class SingleEventWorkflow extends WorkflowEntrypoint<
  {},
  { id: string },
  { "test-event": string },
  { workflowId: string; eventData: string }
> {
  async run(
    event: WorkflowEvent<{ id: string }>,
    step: WorkflowStep<{ "test-event": string }>,
  ) {
    const eventData = await step.waitForEvent("wait-event", {
      type: "test-event",
      timeout: 2000,
    });

    return { workflowId: event.payload.id, eventData };
  }
}

// 测试工作流类 - 等待null payload事件
class NullPayloadEventWorkflow extends WorkflowEntrypoint<
  {},
  { id: string },
  { "null-event": null },
  { workflowId: string; eventData: null }
> {
  async run(
    event: WorkflowEvent<{ id: string }>,
    step: WorkflowStep<{ "null-event": null }>,
  ) {
    const eventData = await step.waitForEvent("wait-null-event", {
      type: "null-event",
      timeout: 2000,
    });

    return { workflowId: event.payload.id, eventData };
  }
}

// 测试工作流类 - 等待复杂对象payload事件
class ComplexPayloadEventWorkflow extends WorkflowEntrypoint<
  {},
  { id: string },
  {
    "complex-event": {
      userId: number;
      action: string;
      metadata: Record<string, any>;
    };
  },
  {
    workflowId: string;
    eventData: {
      userId: number;
      action: string;
      metadata: Record<string, any>;
    };
  }
> {
  async run(
    event: WorkflowEvent<{ id: string }>,
    step: WorkflowStep<{
      "complex-event": {
        userId: number;
        action: string;
        metadata: Record<string, any>;
      };
    }>,
  ) {
    const eventData = await step.waitForEvent("wait-complex-event", {
      type: "complex-event",
      timeout: 2000,
    });

    return { workflowId: event.payload.id, eventData };
  }
}

// 测试工作流类 - 等待多个不同类型的事件
class MultipleEventsWorkflow extends WorkflowEntrypoint<
  {},
  { id: string },
  { "event-a": string; "event-b": number },
  { workflowId: string; eventA: string; eventB: number }
> {
  async run(
    event: WorkflowEvent<{ id: string }>,
    step: WorkflowStep<{ "event-a": string; "event-b": number }>,
  ) {
    const eventA = await step.waitForEvent("wait-a", {
      type: "event-a",
      timeout: 2000,
    });

    const eventB = await step.waitForEvent("wait-b", {
      type: "event-b",
      timeout: 2000,
    });

    return { workflowId: event.payload.id, eventA, eventB };
  }
}

test("pending事件机制 - 事件在waitForEvent前触发", async () => {
  const workflow = new LocalWorkflow(SingleEventWorkflow);
  const instance = await workflow.create({
    params: { id: "test-workflow-1" },
  });

  // 先发送事件（在waitForEvent开始前）
  await instance.sendEvent({ type: "test-event", payload: "early-event" });

  // 等待一段时间让工作流启动并处理pending事件
  await new Promise((resolve) => setTimeout(resolve, 100));

  const status = await instance.status();
  expect(status.status).toBe("complete");
  expect(status.output).toEqual({
    workflowId: "test-workflow-1",
    eventData: "early-event",
  });
});

test("pending事件机制 - 事件在waitForEvent后触发", async () => {
  const workflow = new LocalWorkflow(SingleEventWorkflow);
  const instance = await workflow.create({
    params: { id: "test-workflow-2" },
  });

  // 延迟发送事件（在waitForEvent开始后）
  setTimeout(async () => {
    await instance.sendEvent({ type: "test-event", payload: "late-event" });
  }, 50);

  // 等待工作流完成
  await new Promise((resolve) => setTimeout(resolve, 200));

  const status = await instance.status();
  expect(status.status).toBe("complete");
  expect(status.output).toEqual({
    workflowId: "test-workflow-2",
    eventData: "late-event",
  });
});

test("pending事件机制 - null payload事件", async () => {
  const workflow = new LocalWorkflow(NullPayloadEventWorkflow);
  const instance = await workflow.create({
    params: { id: "test-workflow-3" },
  });

  // 先发送null payload事件
  await instance.sendEvent({ type: "null-event", payload: null });

  // 等待工作流完成
  await new Promise((resolve) => setTimeout(resolve, 100));

  const status = await instance.status();
  expect(status.status).toBe("complete");
  expect(status.output).toEqual({
    workflowId: "test-workflow-3",
    eventData: null,
  });
});

test("pending事件机制 - 复杂对象payload事件", async () => {
  const workflow = new LocalWorkflow(ComplexPayloadEventWorkflow);
  const instance = await workflow.create({
    params: { id: "test-workflow-4" },
  });

  const complexPayload = {
    userId: 12345,
    action: "update-profile",
    metadata: {
      timestamp: Date.now(),
      source: "web-app",
      version: "1.2.3",
    },
  };

  // 先发送复杂payload事件
  await instance.sendEvent({ type: "complex-event", payload: complexPayload });

  // 等待工作流完成
  await new Promise((resolve) => setTimeout(resolve, 100));

  const status = await instance.status();
  expect(status.status).toBe("complete");
  expect(status.output).toEqual({
    workflowId: "test-workflow-4",
    eventData: complexPayload,
  });
});

test("pending事件机制 - 多个不同类型事件", async () => {
  const workflow = new LocalWorkflow(MultipleEventsWorkflow);
  const instance = await workflow.create({
    params: { id: "test-workflow-5" },
  });

  // 先发送两个不同类型的事件
  await instance.sendEvent({ type: "event-a", payload: "data-a" });
  await instance.sendEvent({ type: "event-b", payload: 42 });

  // 等待工作流完成
  await new Promise((resolve) => setTimeout(resolve, 200));

  const status = await instance.status();
  expect(status.status).toBe("complete");
  expect(status.output).toEqual({
    workflowId: "test-workflow-5",
    eventA: "data-a",
    eventB: 42,
  });
});

test("pending事件机制 - 事件顺序测试", async () => {
  const workflow = new LocalWorkflow(SingleEventWorkflow);
  const instance = await workflow.create({
    params: { id: "test-workflow-6" },
  });

  // 发送多个相同类型的事件，只有第一个会被处理
  await instance.sendEvent({ type: "test-event", payload: "first-event" });
  await instance.sendEvent({ type: "test-event", payload: "second-event" });

  // 等待工作流完成
  await new Promise((resolve) => setTimeout(resolve, 100));

  const status = await instance.status();
  expect(status.status).toBe("complete");
  expect(status.output).toEqual({
    workflowId: "test-workflow-6",
    eventData: "first-event", // 应该是第一个事件
  });
});

test("pending事件机制 - 混合触发时机", async () => {
  const workflow = new LocalWorkflow(MultipleEventsWorkflow);
  const instance = await workflow.create({
    params: { id: "test-workflow-7" },
  });

  // 先发送event-a（在waitForEvent前）
  await instance.sendEvent({ type: "event-a", payload: "early-a" });

  // 延迟发送event-b（在waitForEvent后）
  setTimeout(async () => {
    await instance.sendEvent({ type: "event-b", payload: 99 });
  }, 100);

  // 等待工作流完成
  await new Promise((resolve) => setTimeout(resolve, 300));

  const status = await instance.status();
  expect(status.status).toBe("complete");
  expect(status.output).toEqual({
    workflowId: "test-workflow-7",
    eventA: "early-a",
    eventB: 99,
  });
});
