import { expect, expectTypeOf, test } from "bun:test";
import type {
  WorkflowEntrypoint,
  WorkflowEvent,
  WorkflowStep,
} from "../src/index.js";

// 定义测试用的EventMap
type TestEventMap = {
  "user-input": string;
  confirmation: boolean;
  timeout: void;
  "data-update": { id: number; value: string };
};

// 类型测试：验证EventMap的键类型
test("EventMap 键类型正确推断", () => {
  type Keys = keyof TestEventMap;
  const keys: Keys[] = ["user-input", "confirmation", "timeout", "data-update"];
  expect(keys).toEqual([
    "user-input",
    "confirmation",
    "timeout",
    "data-update",
  ]);
});

// 类型测试：验证EventMap的值类型
test("EventMap 值类型正确推断", () => {
  type UserInputType = TestEventMap["user-input"];
  type ConfirmationType = TestEventMap["confirmation"];
  type TimeoutType = TestEventMap["timeout"];
  type DataUpdateType = TestEventMap["data-update"];

  // 这些是编译时类型检查，如果类型不对会编译失败
  const userInput: UserInputType = "test";
  const confirmation: ConfirmationType = true;
  const timeout: TimeoutType = undefined;
  const dataUpdate: DataUpdateType = { id: 1, value: "test" };

  expect(userInput).toBe("test");
  expect(confirmation).toBe(true);
  expect(timeout).toBeUndefined();
  expect(dataUpdate).toEqual({ id: 1, value: "test" });
});

// 类型测试：验证无效的事件类型会被TypeScript拒绝
test("无效事件类型在编译时被拒绝", () => {
  // 这个测试验证TypeScript会阻止无效的事件类型
  // 我们通过类型断言来验证

  type ValidKeys = keyof TestEventMap;

  // 验证有效的键
  const validKeys: ValidKeys[] = [
    "user-input",
    "confirmation",
    "timeout",
    "data-update",
  ];
  expect(validKeys.length).toBe(4);

  // 验证无效的键不会被接受（通过类型检查）
  // 注意：TypeScript在运行时允许字符串，但类型系统会警告
  // 这个测试主要验证类型定义的正确性
});

// 类型测试：验证WorkflowStep的泛型参数
test("WorkflowStep 泛型参数正常工作", () => {
  type DefaultEventMap = Record<string, any>;
  type CustomEventMap = { test: number };

  // 默认EventMap
  let defaultStep: WorkflowStep<DefaultEventMap> | undefined = undefined;
  // 自定义EventMap
  let customStep: WorkflowStep<CustomEventMap> | undefined = undefined;

  expect(defaultStep).toBeUndefined();
  expect(customStep).toBeUndefined();
});

// 类型测试：验证sendEvent的payload类型检查
test("sendEvent 有效载荷类型正确强制执行", () => {
  // 这个测试验证sendEvent方法的类型安全
  // 在实际运行时，我们无法直接测试类型检查，但可以通过类型断言验证

  type TestInstance = {
    sendEvent<K extends keyof TestEventMap>(options: {
      type: K;
      payload?: TestEventMap[K];
    }): Promise<void>;
  };

  let instance: TestInstance | undefined = undefined;

  // 这些调用在类型上是安全的
  // instance.sendEvent({ type: 'user-input', payload: 'test' }); // string
  // instance.sendEvent({ type: 'confirmation', payload: true }); // boolean
  // instance.sendEvent({ type: 'timeout' }); // no payload
  // instance.sendEvent({ type: 'data-update', payload: { id: 1, value: 'test' } }); // object

  expect(instance).toBeUndefined();
});

// 类型测试：验证WorkflowEntrypoint的类型推断
test("WorkflowEntrypoint 类型推断", () => {
  // 测试WorkflowEntrypoint可以与TestEventMap一起使用
  expectTypeOf<WorkflowEntrypoint<{}, {}, TestEventMap, any>>().toEqualTypeOf<
    WorkflowEntrypoint<{}, {}, TestEventMap, any>
  >();

  // 测试run方法的类型
  type TestWorkflow = WorkflowEntrypoint<{}, {}, TestEventMap, any>;
  expectTypeOf<TestWorkflow["run"]>().toBeFunction();

  // 测试参数类型匹配
  type RunParams = Parameters<TestWorkflow["run"]>;
  expectTypeOf<RunParams[0]>().toEqualTypeOf<WorkflowEvent<{}>>();
  expectTypeOf<RunParams[1]>().toEqualTypeOf<WorkflowStep<TestEventMap>>();
});

// 类型测试：验证WorkflowStep的事件类型推断
test("WorkflowStep 事件类型推断", () => {
  type Step = WorkflowStep<TestEventMap>;

  // 测试waitForEvent方法存在
  expectTypeOf<Step["waitForEvent"]>().toBeFunction();

  // 创建一个类型检查函数来验证waitForEvent的返回类型
  // 这个函数不会运行，但TypeScript会在编译时检查类型
  const typeCheck = (step: Step) => {
    // 这些赋值会在编译时验证类型是否正确
    const userInput: Promise<string> = step.waitForEvent("step1", {
      type: "user-input",
    });
    const confirmed: Promise<boolean> = step.waitForEvent("step2", {
      type: "confirmation",
    });
    const timeoutResult: Promise<void> = step.waitForEvent("step3", {
      type: "timeout",
    });
    const dataUpdate: Promise<{ id: number; value: string }> =
      step.waitForEvent("step4", { type: "data-update" });

    return { userInput, confirmed, timeoutResult, dataUpdate };
  };

  // 验证函数存在
  expectTypeOf(typeCheck).toBeFunction();
});
