ALTER TABLE "virtual_models" DROP CONSTRAINT "virtual_models_model_group_id_model_groups_id_fk";
--> statement-breakpoint
ALTER TABLE "model_groups" DROP COLUMN "routing_config";--> statement-breakpoint
ALTER TABLE "virtual_models" DROP COLUMN "model_group_id";