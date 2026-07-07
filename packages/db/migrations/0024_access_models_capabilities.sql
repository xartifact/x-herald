-- 为接入模型添加能力配置字段
-- 允许直接在接入模型上设置能力，优先级高于从路由规则动态推算的能力

ALTER TABLE "access_models" ADD COLUMN "capabilities" jsonb;
