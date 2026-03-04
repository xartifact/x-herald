ALTER TABLE "model_instances" DROP CONSTRAINT "model_instances_group_id_model_groups_id_fk";
--> statement-breakpoint
ALTER TABLE "model_instances" ALTER COLUMN "group_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "model_instances" ADD CONSTRAINT "model_instances_group_id_model_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."model_groups"("id") ON DELETE set null ON UPDATE no action;