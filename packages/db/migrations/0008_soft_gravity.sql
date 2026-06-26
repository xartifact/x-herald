CREATE TABLE "client_requested_models" (
	"model_name" varchar(255) PRIMARY KEY NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"request_count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_client_models_last_seen" ON "client_requested_models" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "idx_client_models_request_count" ON "client_requested_models" USING btree ("request_count");