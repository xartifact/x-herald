-- 会话标识不能假定是 UUID：`x-conversation-id` 是客户端自由字符串。
--
-- 背景：`request_logs.conversation_id` 是 uuid 列，而客户端会话标识来自
-- `x-conversation-id` 等头部，取值形如 `sess-abc123` / `claude-code-<hash>`。
-- 写入非 UUID 值会让整条日志 INSERT 抛
-- `invalid input syntax for type uuid`，于是请求日志、request_attempts 与
-- cost_records 一起丢失 —— 恰恰是最需要审计的多轮会话。
--
-- 修法：新增文本列 `conversation_key` 承载**任意**会话标识，保留 `conversation_id`
-- 供旧数据与既有查询继续可用（两个 uuid 兼容的调用方仍可写它）。
-- 读路径优先 conversation_key，回落 conversation_id。
--
-- 幂等：所有语句带 IF NOT EXISTS，可对任意库状态重复执行。

ALTER TABLE "request_logs"
  ADD COLUMN IF NOT EXISTS "conversation_key" varchar(255);

CREATE INDEX IF NOT EXISTS "idx_request_logs_conversation_key"
  ON "request_logs" ("conversation_key");

-- 回填：历史行里合法的 uuid 会话标识同步到新列，使「按会话聚合」在迁移后
-- 立刻对新旧数据一致生效。非 uuid 的历史值不存在（写入会失败），无需处理。
UPDATE "request_logs"
SET "conversation_key" = "conversation_id"::text
WHERE "conversation_key" IS NULL
  AND "conversation_id" IS NOT NULL;
