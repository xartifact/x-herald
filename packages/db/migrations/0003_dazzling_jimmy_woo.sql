ALTER TABLE "request_logs" ADD COLUMN IF NOT EXISTS "provider_request_headers" jsonb;--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN IF NOT EXISTS "client_type" varchar(100);