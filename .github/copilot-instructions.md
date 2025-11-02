---
description: Use Bun instead of Node.js, npm, pnpm, or vite. Workflow library patterns and conventions.
applyTo: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bunx tsc --noEmit` to type-check.
Use `bun test` to run tests.

To filter tests, use `bun test --test-name-pattern <filter>`.

```ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

### Key Conventions
- ES modules with `.js` extensions in imports (TypeScript compilation target)
- Duration parsing: `'1 hour'`, `'30 seconds'`, `'5 minutes'` (not ISO strings)
- Instance IDs are auto-generated if not provided
- Events are stored with instance state for resumability
- All async operations are Promise-based

### Development Workflow
- `bun run example.ts` - Basic usage example
- `bun run advanced-example.ts` - Pause/resume and event handling demo
- `bun test` - Run comprehensive test suite

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.