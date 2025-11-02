/**
 * 表示工作流中不应重试的错误。
 *
 * 此错误用于指示工作流步骤遇到了无法通过重试操作解决的失败。常见场景包括：
 * - 无效的输入数据，无法更正
 * - 由于凭据不正确导致的身份验证失败
 * - 资源未找到错误（例如，缺少文件或端点）
 * - 阻止执行的配置错误
 * - 永久性的业务逻辑违规
 *
 * 当从工作流步骤抛出此错误时，工作流引擎将标记该步骤为失败，并且不会尝试重试它，
 * 允许工作流完全失败或继续到错误处理路径。
 *
 * @example
 * ```typescript
 * // 在工作流步骤函数中
 * if (inputData.isInvalid) {
 *   throw new NonRetryableError("提供的输入数据无效");
 * }
 * ```
 *
 * @example
 * ```typescript
 * // 使用自定义错误名称
 * throw new NonRetryableError("身份验证失败", "AuthError");
 * ```
 */
export class NonRetryableError extends Error {
  /**
   * 创建一个新的 NonRetryableError 实例。
   *
   * @param message - 描述错误的描述性消息。
   * @param name - 可选的自定义错误名称。默认为 "NonRetryableError"。
   */
  constructor(message: string, name?: string) {
    super(message);
    this.name = name || "NonRetryableError";
  }
}
