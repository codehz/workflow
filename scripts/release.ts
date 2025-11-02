import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// 获取最新 git tag
const tagOutput = await Bun.$`git describe --tags --abbrev=0`;
const tag = tagOutput.text().trim();
const version = tag.startsWith('v') ? tag.slice(1) : tag;

// 读取并更新 package.json 的 version
const pkgPath = 'package.json';
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

// 运行构建
await Bun.$`bun build src/index.ts --outdir dist --target node`;
await Bun.$`bunx tsc --project tsconfig.build.json`;

// 创建 dist/package.json
const publishPkg = {
  name: pkg.name,
  version: pkg.version,
  type: pkg.type,
  main: './index.js',
  types: './index.d.ts',
  exports: {
    '.': {
      types: './index.d.ts',
      import: './index.js'
    }
  },
  peerDependencies: pkg.peerDependencies,
};

writeFileSync(join('dist', 'package.json'), JSON.stringify(publishPkg, null, 2));

console.log('Release script completed. Ready for publish.');