import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

// 移除开发相关的字段
delete pkg.module;
delete pkg.scripts; // 或者保留build，如果需要
delete pkg.devDependencies;

// 保留发布相关的字段
const publishPkg = {
  name: pkg.name,
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
  // 添加其他如果有，如version, description等
};

writeFileSync(join('dist', 'package.json'), JSON.stringify(publishPkg, null, 2));