CREATE TABLE "model_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"virtual_model_id" uuid,
	"conditions" jsonb DEFAULT '[]'::jsonb,
	"action" jsonb NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"flow_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "model_routes" ADD CONSTRAINT "model_routes_virtual_model_id_virtual_models_id_fk" FOREIGN KEY ("virtual_model_id") REFERENCES "public"."virtual_models"("id") ON DELETE cascade ON UPDATE no action;