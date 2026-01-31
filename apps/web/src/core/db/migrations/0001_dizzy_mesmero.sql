ALTER TABLE "request_logs" ADD COLUMN IF NOT EXISTS "transformed_request_body" jsonb;
