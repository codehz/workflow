# @codehz/workflow

[中文版](README.md)

This is the English translation of the Chinese README.md.

A workflow execution library designed specifically for local environments, built on the Cloudflare Workflows API, adapting the powerful features of the Cloudflare Worker ecosystem to local development.

## Features

- **Local-first**: No need for Cloudflare Worker environment, execute workflows efficiently locally
- **Storage abstraction**: Supports flexible storage backends, provides in-memory implementation by default
- **State recovery**: Supports pausing, resuming, and seamless restarting of workflow instances
- **Type safety**: Provides complete TypeScript type definitions for a better development experience
- **Event-driven**: Built-in event waiting mechanism, supports complex workflow orchestration

## Installation

```bash
bun install @codehz/workflow
```

This library is pure TypeScript implementation, no additional runtime dependencies required.

## Version Management

This project uses custom release scripts for version management.

### Commit Conventions

Please follow the [Conventional Commits](https://conventionalcommits.org/) specification for writing commit messages:

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation updates
- `style:` Code style adjustments
- `refactor:` Refactoring
- `test:` Test-related
- `chore:` Build process or auxiliary tool changes

## Type Safety Warning

⚠️ **Important**: This library uses a strict TypeScript type system with default type parameters set to `unknown` for type safety.

When using it, you **must explicitly specify all type parameters in the WorkflowEntrypoint subclass**, but when creating LocalWorkflow, you can omit type parameters as they will be inferred from the first parameter:

```typescript
// ❌ Wrong: Using default unknown types
class MyWorkflow extends WorkflowEntrypoint {
  // This will cause type errors because Env, Params, Result are all unknown
}

// ✅ Correct: Explicitly specify all type parameters
class MyWorkflow extends WorkflowEntrypoint<
  { apiKey: string }, // Env
  { userId: number }, // Params
  { "user-input": string }, // EventMap
  { result: string } // Result
> {
  async run(
    event: WorkflowEvent<{ userId: number }>,
    step: WorkflowStep<{ "user-input": string }>,
  ): Promise<{ result: string }> {
    // Your logic
    return { result: "done" };
  }
}

// When creating workflows, you can omit type parameters as they will be inferred from the first parameter
const workflow = new LocalWorkflow(MyWorkflow, { apiKey: "your-key" }, storage);
```

### Default Type Parameters

- `Env = unknown` - Environment type, defaults to `unknown` to force you to specify environment object types
- `Params = unknown` - Parameter type, defaults to `unknown` to force you to specify event parameter types
- `EventMap = Record<string, any>` - Event mapping type, provides reasonable defaults
- `Result = void` - Result type, defaults to `void` indicating workflows don't return values by default

### Defining Workflows

```typescript
import { WorkflowEntrypoint } from "@codehz/workflow";
import type { WorkflowEvent, WorkflowStep } from "@codehz/workflow";

class MyWorkflow extends WorkflowEntrypoint<Env, Params, EventMap, Result> {
  async run(
    event: WorkflowEvent<Params>,
    step: WorkflowStep<EventMap>,
  ): Promise<Result> {
    // Execute steps
    const result = await step.do("step-name", async () => {
      // Your logic
      return "result";
    });

    // Sleep
    await step.sleep("wait", "5 seconds");

    // Wait for events
    const eventData = await step.waitForEvent("wait-input", {
      type: "user-input",
      timeout: "1 hour",
    });

    return result;
  }
}
```

### Creating and Running Workflow Instances

```typescript
import { LocalWorkflow } from "@codehz/workflow";
import { InMemoryWorkflowStorage } from "@codehz/workflow/storages/in-memory";

// Create storage (default in-memory)
const storage = new InMemoryWorkflowStorage();

// Create workflow
const workflow = new LocalWorkflow(MyWorkflow, env, storage);

// Create instance
const instance = await workflow.create({
  id: "my-instance",
  params: {
    /* Parameters */
  },
});

// Check status
const status = await instance.status();

// Pause/Resume
await instance.pause();
await instance.resume();

// Send events
await instance.sendEvent({
  type: "user-input",
  payload: { data: "value" },
});
```

### Storage Interface

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

You can implement custom storage backends, such as file storage, database storage, etc., to meet different persistence needs.

## API Reference

### WorkflowEntrypoint

The base class for workflows, you need to inherit from this class and implement the `run` method.

**Generic parameters** (must be explicitly specified):

- `Env`: Environment type (default: `unknown`)
- `Params`: Parameter type (default: `unknown`)
- `EventMap`: Event mapping type (default: `Record<string, any>`)
- `Result`: Return result type (default: `void`)

### WorkflowStep

Provides step execution methods:

- `do(name, callback)`: Execute a step
- `do(name, config, callback)`: Execute a step (supports retry and timeout configuration)
- `sleep(name, duration)`: Sleep for a specified duration
- `sleepUntil(name, timestamp)`: Sleep until a specified time
- `waitForEvent(name, options)`: Wait for events of a specified type

### WorkflowInstance

Instance management. Generic parameters are the same as `LocalWorkflow`.

- `pause()`: Pause instance execution
- `resume()`: Resume instance execution
- `terminate()`: Terminate instance execution
- `restart()`: Restart instance
- `status()`: Get instance status details
- `sendEvent(options)`: Send events to the instance

### LocalWorkflow

Workflow management. Generic parameters are the same as `WorkflowEntrypoint`.

- `create(options)`: Create an instance
- `createBatch(batch)`: Batch create
- `get(id)`: Get an instance
- `recover()`: Recover all unfinished workflow instances
- `shutdown()`: Shut down the workflow, stop all executions

### Auto-recovery

When the application starts, you can call `recover()` to automatically recover previously unfinished workflow instances:

```typescript
// On application startup
await workflow.recover();
```

This will scan all instances in storage, recover instances with statuses like `running`, `paused`, `waiting`, etc., that are not completed, ensuring workflows can continue from where they were interrupted.

## License

MIT
