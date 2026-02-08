ALTER TABLE "request_logs" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "tool_calls_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
CREATE INDEX "idx_request_logs_tool_calls_count" ON "request_logs" USING btree ("tool_calls_count");--> statement-breakpoint
CREATE INDEX "idx_request_logs_conversation_id" ON "request_logs" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_request_logs_status_created_at" ON "request_logs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_request_logs_metadata_gin" ON "request_logs" USING gin ("metadata");