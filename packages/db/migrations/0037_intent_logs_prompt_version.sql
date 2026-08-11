-- 记录每次分类调用使用的 prompt 版本号，与 classifier_system_prompt 文本并列。
-- 老行该列为 NULL（升级前落库的行）。
ALTER TABLE "intent_logs"
  ADD COLUMN IF NOT EXISTS "classifier_prompt_version" integer;