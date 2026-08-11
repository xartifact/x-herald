-- 分类器原始 HTTP 请求 / 响应体（类似 request_logs 的 requestBody / responseBody / statusCode）。
-- 不加 IF NOT EXISTS 检查，因为 0033 不久就跑失败过（同名列问题）。
-- 这里跟 0033 列不同，直接加。
ALTER TABLE "intent_logs"
  ADD COLUMN IF NOT EXISTS "classifier_request_body" JSONB,
  ADD COLUMN IF NOT EXISTS "classifier_response_body" JSONB,
  ADD COLUMN IF NOT EXISTS "classifier_status_code" SMALLINT;

COMMENT ON COLUMN "intent_logs"."classifier_request_body" IS '发给分类器的完整 HTTP 请求体 (JSONB)，含 model / messages / max_tokens / temperature';
COMMENT ON COLUMN "intent_logs"."classifier_response_body" IS '分类器 HTTP 响应的完整 JSON body，含 choices / usage / timings';
COMMENT ON COLUMN "intent_logs"."classifier_status_code" IS '分类器 HTTP 响应状态码（200 / 429 / 500 等）';