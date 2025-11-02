// scripts/dist.ts - 构建脚本

import { $ } from "bun";

export async function build() {
  // 构建主入口
  await $`bun build src/index.ts --outdir dist --target node`;

  // 构建存储实现
  await $`bun build src/storages/in-memory.ts --outdir dist/storages --target node`;
  await $`bun build src/storages/disabled.ts --outdir dist/storages --target node`;

  // 生成类型定义
  await $`bunx tsc --project tsconfig.build.json`;
}

// 如果直接运行此脚本，执行构建
if (import.meta.main) {
  await build();
}
