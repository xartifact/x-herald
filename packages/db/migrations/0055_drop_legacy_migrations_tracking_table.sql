-- runPostgresMigrations/runPgliteMigrations 曾经把应用状态记录到无 schema 前缀的
-- public.__drizzle_migrations，而 packages/db/src/migrate.ts 手动脚本此前走的是
-- drizzle-orm 官方 migrate()，写入 drizzle.__drizzle_migrations——两套机制、两张表、
-- 两种哈希算法互不识别彼此的"已应用"记录，导致同一批迁移被重复执行（虽然都有
-- IF NOT EXISTS 等守卫，重跑本身无害，但容易误导排查）。
-- 现已统一：manual 脚本和启动时自动迁移都调用同一个 runPostgresMigrations，
-- 写入同一张 drizzle.__drizzle_migrations。这张遗留的 public 表不再被任何代码
-- 读写，清理掉。
DROP TABLE IF EXISTS "public"."__drizzle_migrations";
