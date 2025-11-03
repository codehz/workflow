function parseDuration(duration: string): number {
  // 简单解析，如 "1 hour", "30 seconds"
  const match = duration.match(/(\d+)\s*(second|minute|hour|day)s?/);
  if (!match || !match[1])
    throw new Error(`Invalid duration format: ${duration}`);
  const value = parseInt(match[1]);
  const unit = match[2];
  switch (unit) {
    case "second":
      return value * 1000;
    case "minute":
      return value * 60 * 1000;
    case "hour":
      return value * 60 * 60 * 1000;
    case "day":
      return value * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Invalid duration unit: ${unit}`);
  }
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export { parseDuration, generateId, getErrorMessage };
