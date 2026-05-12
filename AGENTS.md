# Agent 行为规范

本文件记录 AI Agent 在此项目中必须遵守的操作规则，优先级高于通用默认行为。

## 严禁操作

### 禁止直接修改数据库结构

**规则：数据库结构（表、列、索引、约束等）只允许通过 Drizzle 迁移文件修改，禁止直接在数据库中执行 DDL 操作。**

所有数据库 schema 变更必须遵循以下流程：
1. 在 `apps/web/src/core/db/migrations/` 目录下创建新的 SQL 迁移文件
2. 使用 `IF EXISTS` / `IF NOT EXISTS` 等守卫语句确保迁移可重复执行
3. 更新 `apps/web/src/core/db/migrations/meta/_journal.json` 中的迁移记录
4. 同步更新 `apps/web/src/features/model-groups/db.ts` 中的 Drizzle schema 定义

**禁止行为：**
- ❌ 直接使用 `psql`、`pgAdmin` 等工具执行 `ALTER TABLE`、`CREATE TABLE`、`DROP COLUMN` 等 DDL 语句
- ❌ 在生产/测试环境中手动修改数据库结构而不创建迁移文件
- ❌ 在应用代码中执行原始 SQL 来修改 schema（如 `client.unsafe('ALTER TABLE ...')` 用于结构变更）

**允许行为：**
- ✅ 通过 Drizzle 迁移文件修改数据库结构
- ✅ 使用 `client.unsafe()` 执行 DML 语句（INSERT/UPDATE/DELETE/SELECT）
- ✅ 临时查询排查问题（SELECT 语句）

**违规后果：** 直接修改数据库会导致代码与 schema 不一致，迁移系统失效，生产环境出现严重错误（如 `column does not exist`）。

### 禁止删除 .pglite 目录

**规则：绝对不能删除 `apps/web/.pglite/` 目录或其中的任何文件。**

`.pglite/` 是开发环境的本地数据库（PGlite/WASM SQLite），存储用户所有业务数据（供应商、模型组、密钥、日志等）。删除后数据永久丢失，无法恢复。

**遇到 PGlite 启动报错时的正确处理方式：**
1. 先读取 `apps/web/src/core/db/client.ts` 和 `apps/web/src/instrumentation.node.ts` 排查代码问题
2. 检查是否有未完成的数据库迁移（`bun run db:migrate`）
3. 检查是否有进程占用数据库文件（`lsof | grep pglite`）
4. **需要用户明确确认后才能考虑删除**，且必须提前告知"这将清空所有本地数据"

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **x-llm-gateway** (3222 symbols, 5689 relationships, 162 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/x-llm-gateway/context` | Codebase overview, check index freshness |
| `gitnexus://repo/x-llm-gateway/clusters` | All functional areas |
| `gitnexus://repo/x-llm-gateway/processes` | All execution flows |
| `gitnexus://repo/x-llm-gateway/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

## 测试工程师 Agent

当需要编写测试时，参考 `.claude/agents/test-engineer.md` 中的完整定义。

### 核心规则
- 后端测试用 `bun:test`，React 组件测试用 `vitest`（仅 `*.ui.test.tsx`）
- 测试文件与源文件同目录：`foo.ts` → `foo.test.ts`
- Mock 优先级：真实代码 > Hono test client > `mock.module()` > `vi.mock()` > MSW
- 使用工厂函数（`src/test/factories.ts`），不用 JSON fixture
- 不要运行全量测试，只运行目标文件

### 测试命令
- 后端测试: `bun test src/features/gateway/failover/failover-executor.test.ts`
- React 组件测试: `bun run test:ui`
- 类型检查: `cd apps/web && bun run typecheck`

### 测试基础设施
| 文件 | 用途 |
|------|------|
| `apps/web/src/test/factories.ts` | Mock 数据工厂函数 |
| `apps/web/src/test/hono-helper.ts` | Hono 测试请求辅助 |
| `apps/web/src/test/setup.ts` | bun:test 全局 setup |
| `apps/web/src/test/ui-setup.ts` | vitest React 组件 setup |
| `apps/web/vitest.ui.ts` | vitest UI 测试配置 |
| `.claude/skills/writing-tests/SKILL.md` | 测试编写规范 |
| `.claude/skills/engineering-conventions/SKILL.md` | 工程编码规范 |
