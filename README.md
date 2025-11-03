# @codehz/workflow

[English Version](README.en.md)

一个专为本地环境设计的工作流执行库，基于 Cloudflare Workflows API 构建，将 Cloudflare Worker 生态系统的强大功能适配到本地开发环境中。

## 特性

- **本地优先**: 无需 Cloudflare Worker 环境，直接在本地高效执行工作流
- **存储抽象**: 支持灵活的存储后端，默认提供内存实现
- **状态恢复**: 支持工作流实例的暂停、恢复和无缝重启
- **类型安全**: 提供完整的 TypeScript 类型定义，确保开发体验
- **事件驱动**: 内置事件等待机制，支持复杂的工作流编排

## 安装

```bash
bun install @codehz/workflow
```

此库为纯 TypeScript 实现，无需额外运行时依赖。

## 版本管理

本项目采用自定义发布脚本来管理版本发布。

### 提交规范

请遵循 [Conventional Commits](https://conventionalcommits.org/) 规范来编写提交消息：

- `feat:` 新功能
- `fix:` 修复 bug
- `docs:` 文档更新
- `style:` 代码风格调整
- `refactor:` 重构
- `test:` 测试相关
- `chore:` 构建过程或辅助工具的变动

## 类型安全警告

⚠️ **重要**: 此库使用严格的TypeScript类型系统，默认类型参数设置为`unknown`以确保类型安全。

在使用时，您**必须在 WorkflowEntrypoint.create 调用中显式指定所有类型参数**：

```typescript
// ❌ 错误：使用默认unknown类型
const MyWorkflow = WorkflowEntrypoint.create(async function (event, step) {
  // 这会导致类型错误，因为Env, Params, Result都是unknown
});

// ✅ 正确：显式指定所有类型参数
const MyWorkflow = WorkflowEntrypoint.create<
  { apiKey: string }, // Env
  { userId: number }, // Params
  { "user-input": string }, // EventMap
  { result: string } // Result
>(async function (event, step) {
  // 您的逻辑
  return { result: "done" };
});

// 创建工作流时可以省略类型参数，它们会从第一个参数自动推导
const workflow = new LocalWorkflow(MyWorkflow, { apiKey: "your-key" }, storage);
```

### 默认类型参数

- `Env = unknown` - 环境类型，默认为`unknown`强制您指定环境对象类型
- `Params = unknown` - 参数类型，默认为`unknown`强制您指定事件参数类型
- `EventMap = Record<string, any>` - 事件映射类型，提供合理的默认值
- `Result = void` - 结果类型，默认为`void`表示工作流默认不返回值

### 定义工作流

```typescript
import { WorkflowEntrypoint } from "@codehz/workflow";

const MyWorkflow = WorkflowEntrypoint.create<Env, Params, EventMap, Result>(
  async function(event, step) {
    // 执行步骤
    const result = await step.do("step-name", async () => {
      // 你的逻辑
      return "result";
    });

    // 睡眠
    await step.sleep("wait", "5 seconds");

    // 等待事件
    const eventData = await step.waitForEvent("wait-input", {
      type: "user-input",
      // 你的逻辑
      return "result";
    });

    // 睡眠
    await step.sleep("wait", "5 seconds");

    // 等待事件
    const eventData = await step.waitForEvent("wait-input", {
      type: "user-input",
      timeout: "1 hour",
    });

    return result;
  }
}
```

### 创建和运行工作流实例

```typescript
import { LocalWorkflow } from "@codehz/workflow";
import { InMemoryWorkflowStorage } from "@codehz/workflow/storages/in-memory";

// 创建存储（默认内存）
const storage = new InMemoryWorkflowStorage();

// 创建工作流
const workflow = new LocalWorkflow(MyWorkflow, env, storage);

// 创建实例
const instance = await workflow.create({
  id: "my-instance",
  params: {
    /* 参数 */
  },
});

// 检查状态
const status = await instance.status();

// 暂停/恢复
await instance.pause();
await instance.resume();

// 发送事件
await instance.sendEvent({
  type: "user-input",
  payload: { data: "value" },
});
```

### 存储接口

```typescript
interface WorkflowStorage {
  saveInstance(instanceId: string, state: InstanceStatusDetail): Promise<void>;
  updateInstance(
    instanceId: string,
    updates: Partial<InstanceStatusDetail>,
  ): Promise<void>;
  updateStepState(
    instanceId: string,
    stepName: string,
    stepState: StepState,
  ): Promise<void>;
  loadInstance(instanceId: string): Promise<InstanceStatusDetail | null>;
  deleteInstance(instanceId: string): Promise<void>;
  listInstanceSummaries(): Promise<InstanceSummary[]>;
  listActiveInstances(): Promise<string[]>;
}
```

您可以实现自定义存储后端，如文件存储、数据库存储等，以满足不同的持久化需求。

## API 参考

### WorkflowEntrypoint

工作流的基类，您需要继承此类并实现 `run` 方法。

**泛型参数** (必须显式指定):

- `Env`: 环境类型 (默认: `unknown`)
- `Params`: 参数类型 (默认: `unknown`)
- `EventMap`: 事件映射类型 (默认: `Record<string, any>`)
- `Result`: 返回结果类型 (默认: `void`)

### WorkflowStep

提供步骤执行方法：

- `do(name, callback)`: 执行步骤
- `do(name, config, callback)`: 执行步骤（支持重试和超时配置）
- `sleep(name, duration)`: 睡眠指定时长
- `sleepUntil(name, timestamp)`: 睡眠至指定时间
- `waitForEvent(name, options)`: 等待指定类型的事件

### WorkflowInstance

实例管理。泛型参数与 `LocalWorkflow` 相同。

- `pause()`: 暂停实例执行
- `resume()`: 恢复实例执行
- `terminate()`: 终止实例执行
- `restart()`: 重启实例
- `status()`: 获取实例状态详情
- `sendEvent(options)`: 向实例发送事件

### LocalWorkflow

工作流管理。泛型参数与 `WorkflowEntrypoint` 相同。

- `create(options)`: 创建实例
- `createBatch(batch)`: 批量创建
- `get(id)`: 获取实例
- `recover()`: 恢复所有未完成的工作流实例
- `shutdown()`: 关闭工作流，停止所有执行

### 自动恢复

在应用启动时，可以调用 `recover()` 来自动恢复之前未完成的工作流实例：

```typescript
// 应用启动时
await workflow.recover();
```

这将扫描存储中的所有实例，恢复状态为 `running`、`paused`、`waiting` 等未完成状态的实例，确保工作流能够从中断处继续执行。

## 许可证

MIT
