// MIT License
//
// Copyright (c) 2025 codehz
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "./dist.js";

// 获取最新 git tag
const tagOutput = await Bun.$`git describe --tags --abbrev=0`;
const tag = tagOutput.text().trim();
const version = tag.startsWith("v") ? tag.slice(1) : tag;

const pkgPath = "package.json";
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.version = version;

// 运行构建
await build();

// 生成 exports
const distFiles = readdirSync("dist", { recursive: true }).filter(
  (f) => typeof f === "string" && f.endsWith(".js"),
);
const exports: Record<string, any> = {};
for (const file of distFiles) {
  if (typeof file !== "string") continue;
  const normalizedFile = file.replace(/\\/g, "/");
  const key =
    normalizedFile === "index.js"
      ? "."
      : `./${normalizedFile.replace(/\.js$/, "")}`;
  exports[key] = {
    types: `./${normalizedFile.replace(/\.js$/, ".d.ts")}`,
    import: `./${normalizedFile}`,
  };
}

// 创建 dist/package.json
const publishPkg = {
  name: pkg.name,
  version: pkg.version,
  license: pkg.license,
  type: pkg.type,
  main: "./index.js",
  types: "./index.d.ts",
  exports,
  peerDependencies: pkg.peerDependencies,
};

writeFileSync(
  join("dist", "package.json"),
  JSON.stringify(publishPkg, null, 2),
);

// 复制 LICENSE 文件到 dist
await Bun.$`cp LICENSE dist/LICENSE`;

// 复制所有 README 文件到 dist
const readmeFiles = readdirSync(".").filter(
  (f) => typeof f === "string" && f.startsWith("README") && f.endsWith(".md"),
);
for (const file of readmeFiles) {
  await Bun.$`cp ${file} dist/${file}`;
}

console.log("Release script completed. Ready for publish.");
