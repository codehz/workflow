// 无限等待的Promise，用于模拟系统关闭时的阻塞
export const DISABLED_PROMISE: Promise<any> = new Promise(() => {});
