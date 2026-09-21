-- 修正 virtual_keys.last_used_at 的列类型漂移。
--
-- 0027_key_usage_stats 建列时写的是 TIMESTAMPTZ，但：
--   1. drizzle schema (packages/db/src/schema/keys.ts) 声明为 timestamp（无时区），
--      是全库唯一一处 tz-aware 时间列，与其余所有时间列不一致；
--   2. 该不一致在非 UTC 会话时区下会产生 8 小时偏差 —— PG 会把 TIMESTAMPTZ
--      按会话时区渲染成 '2026-09-21 16:10:00+08'，而 drizzle 见 schema 声明为
--      无时区，盲目追加 '+0000'，得到 '2026-09-21 16:10:00+08+0000'，
--      JS 解析为 16:10Z 而非正确的 08:10Z。
--      生产会话恰好是 Etc/UTC 才未暴露。
--
-- 转换使用 AT TIME ZONE 'UTC'：TIMESTAMPTZ → 其 UTC 墙钟的 timestamp，
-- 与全库"时间列存 UTC 墙钟"的既有约定一致，语义不变、无数据损失。
--
-- 幂等：已是 timestamp 时 data_type 判断为假，跳过转换。

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'virtual_keys'
      AND column_name = 'last_used_at'
      AND data_type = 'timestamp with time zone'
  ) THEN
    ALTER TABLE "virtual_keys"
      ALTER COLUMN "last_used_at" TYPE timestamp
      USING "last_used_at" AT TIME ZONE 'UTC';
  END IF;
END $$;
