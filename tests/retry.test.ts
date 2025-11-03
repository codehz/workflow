import { expect, test } from "bun:test";
import type { WorkflowEvent, WorkflowStep } from "../src/index.js";
import {
  LocalWorkflow,
  NonRetryableError,
  WorkflowEntrypoint,
} from "../src/index.js";

// 重试测试工作流
class RetryWorkflow extends WorkflowEntrypoint<
  {},
  {},
  Record<string, any>,
  string
> {
  private attempts = 0;

  async run(event: WorkflowEvent<{}>, step: WorkflowStep) {
    return await step.do(
      "retry-step",
      {
        retries: { limit: 2, delay: 50 },
      },
      async () => {
        this.attempts++;
        if (this.attempts < 3) {
          throw new Error("Temporary failure");
        }
        return "success";
      },
    );
  }
}

// 非重试错误测试
class NonRetryWorkflow extends WorkflowEntrypoint<
  {},
  {},
  Record<string, any>,
  void
> {
  async run(event: WorkflowEvent<{}>, step: WorkflowStep) {
    return await step.do("non-retry-step", async () => {
      throw new NonRetryableError("Non-retryable error");
    });
  }
}

// 错误处理测试工作流
class ErrorHandlingWorkflow extends WorkflowEntrypoint<
  {},
  {},
  Record<string, any>,
  { result: string }
> {
  async run(event: WorkflowEvent<{}>, step: WorkflowStep) {
    try {
      await step.do("error-step", async () => {
        throw new Error("Test error");
      });
      return { result: "no error" };
    } catch (error) {
      return {
        result: `caught: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

// 标准化错误测试工作流
class StandardizedErrorWorkflow extends WorkflowEntrypoint<
  {},
  {},
  Record<string, any>,
  { errorType: string; errorMessage: string }
> {
  async run(event: WorkflowEvent<{}>, step: WorkflowStep) {
    try {
      await step.do("error-step", async () => {
        throw "string error"; // 抛出非 Error 对象
      });
      return { errorType: "none", errorMessage: "" };
    } catch (error) {
      return {
        errorType: error instanceof Error ? "Error" : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

test("步骤重试机制", async () => {
  const workflow = new LocalWorkflow(RetryWorkflow);
  const instance = await workflow.create();

  // 等待完成（包括重试）
  await new Promise((resolve) => setTimeout(resolve, 500));

  const status = await instance.status();
  expect(status.status).toBe("complete");
  expect(status.output).toBe("success");
});

test("非重试错误", async () => {
  const workflow = new LocalWorkflow(NonRetryWorkflow);
  const instance = await workflow.create();

  // 等待失败
  await new Promise((resolve) => setTimeout(resolve, 100));

  const status = await instance.status();
  expect(status.status).toBe("errored");
  expect(status.error).toBe("Non-retryable error");
});

test("工作流中使用 try catch 捕获错误", async () => {
  const workflow = new LocalWorkflow(ErrorHandlingWorkflow);
  const instance = await workflow.create();

  // 等待完成
  await new Promise((resolve) => setTimeout(resolve, 100));

  const status = await instance.status();
  expect(status.status).toBe("complete");
  expect(status.output!.result).toBe("caught: Test error");
});

test("步骤失败时抛出标准化错误", async () => {
  const workflow = new LocalWorkflow(StandardizedErrorWorkflow);
  const instance = await workflow.create();

  // 等待完成
  await new Promise((resolve) => setTimeout(resolve, 100));

  const status = await instance.status();
  expect(status.status).toBe("complete");
  expect(status.output!.errorType).toBe("Error"); // 应该捕获到 Error 实例
  expect(status.output!.errorMessage).toBe("string error");
});
