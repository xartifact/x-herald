ALTER TABLE "intent_logs"
  ADD COLUMN IF NOT EXISTS "classifier_system_prompt" TEXT,
  ADD COLUMN IF NOT EXISTS "classifier_reasoning" TEXT,
  ADD COLUMN IF NOT EXISTS "classifier_request_messages" JSONB,
  ADD COLUMN IF NOT EXISTS "user_message" TEXT;

-- 旧列 user_message_snippet 保留（兼容历史数据），但停止写入
COMMENT ON COLUMN "intent_logs"."user_message_snippet" IS 'deprecated: kept for backward compatibility, new writes go to user_message';
COMMENT ON COLUMN "intent_logs"."user_message" IS '完整用户消息文本（截断已移到应用层）';
COMMENT ON COLUMN "intent_logs"."classifier_system_prompt" IS '调用分类器时使用的 system prompt 全文';
COMMENT ON COLUMN "intent_logs"."classifier_reasoning" IS '推理模型的思考链（reasoning_content），与 content 分开存';
COMMENT ON COLUMN "intent_logs"."classifier_request_messages" IS '传给分类器的 messages 数组 JSONB（仅最后一条 user + system）';