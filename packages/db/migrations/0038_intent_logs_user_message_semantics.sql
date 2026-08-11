-- 重新定义意图日志中「用户消息」的语义边界：
-- 原 user_message 列含上游注入的 <system-reminder>/tool output 等噪声，
-- 与分类器实际看到的清洗后输入不一致。本迁移做以下调整：
--   1. user_message → user_message_raw（旧 raw 文本保留，新语义为「原始未清洗」）
--   2. 新增 user_message（清洗后文本，分类器实际分类的输入）
--   3. 新增 user_message_capabilities text[]（消息含有的能力：vision/audio/video/tool_use）
-- 历史行的 user_message 已被迁到 user_message_raw；新行的 user_message 由 service 写入 cleaned 文本。

ALTER TABLE "intent_logs" RENAME COLUMN "user_message" TO "user_message_raw";

ALTER TABLE "intent_logs" ADD COLUMN IF NOT EXISTS "user_message" text;
ALTER TABLE "intent_logs" ADD COLUMN IF NOT EXISTS "user_message_capabilities" text[] NOT NULL DEFAULT ARRAY[]::text[];

CREATE INDEX IF NOT EXISTS "idx_intent_logs_user_message_capabilities" ON "intent_logs" USING GIN ("user_message_capabilities");
