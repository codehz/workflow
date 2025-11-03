// scripts/dist.ts - 构建脚本

import { $ } from "bun";
import { readdirSync } from "fs";
import { join } from "path";

export async function build() {
  // 清空 dist 目录
  await $`rm -rf dist`;

  // 构建主入口
  await $`bun build src/index.ts --outdir dist --target node`;

  // 自动发现并构建存储实现
  const storagesDir = "src/storages";
  const storageFiles = readdirSync(storagesDir)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => join(storagesDir, file));

  for (const file of storageFiles) {
    await $`bun build ${file} --outdir dist/storages --target node`;
  }

  // 生成类型定义
  await $`bunx tsc --project tsconfig.build.json`;
}

// 如果直接运行此脚本，执行构建
if (import.meta.main) {
  await build();
}
