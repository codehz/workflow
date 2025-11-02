# @codehz/workflow

一个本地运行的工作流执行库，基于Cloudflare Workflows API设计，将Cloudflare Worker基础设施集成的API转换为适合本地使用的API。

## 特性

- **本地运行**: 无需Cloudflare Worker环境，直接在本地执行工作流
- **存储抽象**: 支持可插拔的存储系统，默认提供内存实现
- **恢复执行**: 支持工作流实例的暂停、恢复和重启
- **类型安全**: 完整的TypeScript类型定义
- **事件驱动**: 支持等待外部事件继续执行

## 安装

```bash
bun install
```

## 版本管理

本项目使用自定义发布脚本进行版本管理。

### 提交规范

请遵循 [Conventional Commits](https://conventionalcommits.org/) 规范来编写提交消息：

- `feat:` 新功能
- `fix:` 修复bug
- `docs:` 文档更新
- `style:` 代码风格调整
- `refactor:` 重构
- `test:` 测试相关
- `chore:` 构建过程或辅助工具的变动

## 使用

### 定义工作流

```typescript
import { WorkflowEntrypoint } from '@codehz/workflow';
import type { WorkflowEvent, WorkflowStep } from '@codehz/workflow';

class MyWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    // 执行步骤
    const result = await step.do('step-name', async () => {
      // 你的逻辑
      return 'result';
    });

    // 睡眠
    await step.sleep('wait', '5 seconds');

    // 等待事件
    const eventData = await step.waitForEvent('wait-input', {
      type: 'user-input',
      timeout: '1 hour'
    });

    return result;
  }
}
```

### 创建和运行工作流实例

```typescript
import { LocalWorkflow, InMemoryWorkflowStorage } from '@codehz/workflow';

// 创建存储（默认内存）
const storage = new InMemoryWorkflowStorage();

// 创建工作流
const workflow = new LocalWorkflow(MyWorkflow, env, storage);

// 创建实例
const instance = await workflow.create({
  id: 'my-instance',
  params: { /* 参数 */ }
});

// 检查状态
const status = await instance.status();

// 暂停/恢复
await instance.pause();
await instance.resume();

// 发送事件
await instance.sendEvent({
  type: 'user-input',
  payload: { data: 'value' }
});
```

### 存储接口

```typescript
interface WorkflowStorage {
  saveInstance(instanceId: string, state: InstanceStatusDetail): Promise<void>;
  loadInstance(instanceId: string): Promise<InstanceStatusDetail | null>;
  deleteInstance(instanceId: string): Promise<void>;
  listInstances(): Promise<string[]>;
}
```

可以实现自定义存储，如文件存储、数据库存储等。

## API 参考

### WorkflowEntrypoint

工作流的基类，需要继承并实现 `run` 方法。

### WorkflowStep

提供步骤执行方法：
- `do(name, callback)`: 执行步骤
- `sleep(name, duration)`: 睡眠
- `sleepUntil(name, timestamp)`: 睡眠到指定时间
- `waitForEvent(name, options)`: 等待事件

### WorkflowInstance

实例管理：
- `pause()`: 暂停
- `resume()`: 恢复
- `terminate()`: 终止
- `restart()`: 重启
- `status()`: 获取状态
- `sendEvent(options)`: 发送事件

### LocalWorkflow

工作流管理：
- `create(options)`: 创建实例
- `createBatch(batch)`: 批量创建
- `get(id)`: 获取实例
- `recover()`: 恢复所有未完成的工作流实例

### 自动恢复

在应用启动时，可以调用 `recover()` 来自动恢复之前未完成的工作流实例：

```typescript
// 应用启动时
await workflow.recover();
```

这将扫描存储中的所有实例，恢复状态为 `running`、`paused`、`waiting` 等未完成状态的实例。

## 运行示例

```bash
bun run example.ts
```

## 许可证

MIT
