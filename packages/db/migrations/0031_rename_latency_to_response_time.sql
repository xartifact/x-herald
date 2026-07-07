-- 将 latency_ms 重命名为 response_time_ms
-- 若列已不存在（已重命名）→ "does not exist" → migration runner 安全跳过
-- 若 response_time_ms 已存在 → "already exists" → 安全跳过
ALTER TABLE "request_logs" RENAME COLUMN "latency_ms" TO "response_time_ms";
ALTER TABLE "health_runs" RENAME COLUMN "latency_ms" TO "response_time_ms";
