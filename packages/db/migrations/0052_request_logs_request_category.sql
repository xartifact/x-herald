-- 请求日志按模型请求类型区分（embedding / chat_text / chat_image / chat_video /
-- chat_audio / other），支持日志页按类型筛选与审计。
ALTER TABLE "request_logs"
  ADD COLUMN IF NOT EXISTS "request_category" varchar(30);

CREATE INDEX IF NOT EXISTS "idx_request_logs_request_category"
  ON "request_logs" ("request_category");
