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

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// 获取最新 git tag
const tagOutput = await Bun.$`git describe --tags --abbrev=0`;
const tag = tagOutput.text().trim();
const version = tag.startsWith("v") ? tag.slice(1) : tag;

// 读取并更新 package.json 的 version
const pkgPath = "package.json";
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

// 运行构建
await Bun.$`bun build src/index.ts --outdir dist --target node`;
await Bun.$`bunx tsc --project tsconfig.build.json`;

// 创建 dist/package.json
const publishPkg = {
  name: pkg.name,
  version: pkg.version,
  license: pkg.license,
  type: pkg.type,
  main: "./index.js",
  types: "./index.d.ts",
  exports: {
    ".": {
      types: "./index.d.ts",
      import: "./index.js",
    },
  },
  peerDependencies: pkg.peerDependencies,
};

writeFileSync(
  join("dist", "package.json"),
  JSON.stringify(publishPkg, null, 2)
);

// 复制 LICENSE 文件到 dist
await Bun.$`cp LICENSE dist/LICENSE`;

console.log("Release script completed. Ready for publish.");
