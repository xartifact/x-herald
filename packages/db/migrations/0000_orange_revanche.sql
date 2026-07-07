CREATE TABLE IF NOT EXISTS "providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"api_key" text,
	"protocols" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "model_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb,
	"display_name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(50) DEFAULT 'chat' NOT NULL,
	"capabilities" jsonb NOT NULL,
	"routing_config" jsonb NOT NULL,
	"supported_protocols" jsonb DEFAULT '["openai"]'::jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "model_groups_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "model_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"actual_model_name" varchar(255) NOT NULL,
	"description" text,
	"config" jsonb,
	"weight" integer DEFAULT 100 NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"cost_per_1k_tokens" jsonb,
	"health_check_url" varchar(512),
	"enabled" boolean DEFAULT true NOT NULL,
	"status" varchar(20) DEFAULT 'unknown',
	"last_checked_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "request_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"virtual_key_id" uuid,
	"virtual_key_name" varchar(255),
	"model_name" varchar(255) NOT NULL,
	"provider_id" uuid,
	"provider_name" varchar(255),
	"status" varchar(20) NOT NULL,
	"status_code" integer,
	"latency_ms" integer NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"request_headers" jsonb,
	"request_body" jsonb,
	"standard_request_body" jsonb,
	"transformed_request_body" jsonb,
	"provider_response_headers" jsonb,
	"client_response_headers" jsonb,
	"provider_response_body" jsonb,
	"standard_response_body" jsonb,
	"response_body" jsonb,
	"error_message" text,
	"error_type" varchar(50),
	"client_ip" varchar(45),
	"user_agent" text,
	"request_path" varchar(255),
	"request_method" varchar(10),
	"streaming" varchar(10) DEFAULT 'false' NOT NULL,
	"incoming_protocol" varchar(50),
	"target_protocol" varchar(50),
	"metadata" jsonb,
	"tool_calls_count" integer DEFAULT 0,
	"conversation_id" uuid,
	"stream_status" varchar(20) DEFAULT 'pending',
	"stream_progress" jsonb,
	"stream_content" jsonb,
	"stream_started_at" timestamp,
	"stream_completed_at" timestamp,
	"last_updated_at" timestamp DEFAULT now(),
	"is_complete" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "virtual_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"allowed_models" text[],
	"rate_limit_rpm" integer,
	"rate_limit_rpd" integer,
	"token_limit_daily" bigint,
	"enabled" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "virtual_keys_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "health_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_id" uuid NOT NULL,
	"checked_at" timestamp DEFAULT now() NOT NULL,
	"status" varchar(20) NOT NULL,
	"latency_ms" integer,
	"error_type" varchar(64),
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "health_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(20) NOT NULL,
	"target_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"check_interval_seconds" integer DEFAULT 300 NOT NULL,
	"check_prompt" varchar(512) DEFAULT 'Say "OK"' NOT NULL,
	"check_config" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "model_instances" ADD CONSTRAINT "model_instances_group_id_model_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."model_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "model_instances" ADD CONSTRAINT "model_instances_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_virtual_key_id_virtual_keys_id_fk" FOREIGN KEY ("virtual_key_id") REFERENCES "public"."virtual_keys"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "health_runs" ADD CONSTRAINT "health_runs_target_id_health_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."health_targets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_request_logs_virtual_key_id" ON "request_logs" USING btree ("virtual_key_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_request_logs_model_name" ON "request_logs" USING btree ("model_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_request_logs_provider_id" ON "request_logs" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_request_logs_status" ON "request_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_request_logs_created_at" ON "request_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_request_logs_streaming" ON "request_logs" USING btree ("streaming");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_request_logs_tool_calls_count" ON "request_logs" USING btree ("tool_calls_count");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_request_logs_conversation_id" ON "request_logs" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_request_logs_status_created_at" ON "request_logs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_request_logs_stream_status" ON "request_logs" USING btree ("stream_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_request_logs_is_complete" ON "request_logs" USING btree ("is_complete");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stream_status_complete" ON "request_logs" USING btree ("stream_status","is_complete");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_request_logs_last_updated_at" ON "request_logs" USING btree ("last_updated_at");
