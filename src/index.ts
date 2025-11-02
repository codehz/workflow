// index.ts - 导出公开API

export type {
  // 类型和接口
  WorkflowEvent,
  WorkflowStepConfig,
  InstanceStatus,
  StepState,
  InstanceStatusDetail,
  InstanceSummary,
  WorkflowInstanceCreateOptions,
  WorkflowStep,
  WorkflowInstance,
  Workflow,
} from './types.js';

export type {
  // 存储接口
  WorkflowStorage,
} from './storage.js';

export {
  // 存储实现类
  InMemoryWorkflowStorage,
  DisabledWorkflowStorage,
} from './storage.js';

export {
  // 工作流基类
  WorkflowEntrypoint,
  // 异常类
  NonRetryableError,
} from './types.js';

export {
  // 核心工作流类
  LocalWorkflow,
} from './workflow.js';