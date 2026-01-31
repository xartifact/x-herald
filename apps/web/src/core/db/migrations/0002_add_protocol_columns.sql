ALTER TABLE "request_logs" ADD COLUMN IF NOT EXISTS "incoming_protocol" varchar(50);
ALTER TABLE "request_logs" ADD COLUMN IF NOT EXISTS "target_protocol" varchar(50);
