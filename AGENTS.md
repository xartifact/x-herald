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
