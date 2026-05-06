# Agent 行为规范

本文件记录 AI Agent 在此项目中必须遵守的操作规则，优先级高于通用默认行为。

## 严禁操作

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
