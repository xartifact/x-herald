/**
 * `timestamp` 解析修正（OID 1114 / 1184）。
 *
 * ## 问题
 *
 * 本项目 schema 的时间列是 `timestamp`（无时区，OID 1114），语义为 "UTC 墙钟"
 * —— 依据是 drizzle 的 `PgTimestamp.mapFromDriverValue`：
 *
 * ```js
 * if (typeof value === 'string') return new Date(this.withTimezone ? value : value + '+0000')
 * ```
 *
 * 即对无时区列**主动补 `+0000`** 再解析。普通 `select({ col: table.createdAt })`
 * 走这条路径，正确。
 *
 * 但 drizzle-orm 的 postgres-js driver 在 `construct()` 里把时间 OID 的 parser
 * 全部替换为 transparent parser（`val => val`），转换责任完全下放给列自身。
 * 于是**裸 SQL 聚合**出现缺口 —— 没有任何列参与，字符串原样返回：
 *
 * ```ts
 * sql<string>`max(${requestLogs.createdAt})`   // → "2026-09-21 08:10:00.000"
 * ```
 *
 * 该字符串无时区标记，调用方 `new Date(它)` 会按**运行时本地时区**解释。
 * 本机 TZ=Asia/Shanghai 时产生 −8h 偏差；生产容器若为 UTC 则恰好掩盖问题
 * —— 结果正确性隐式依赖部署环境的 TZ。
 *
 * 实测（PostgreSQL 18 + postgres.js 3.4.9 + drizzle 0.45.2，TZ=Asia/Shanghai）：
 *
 * | 查询 | 修复前 | 修复后 |
 * |---|---|---|
 * | `select({ts})` | `Date(08:10:00Z)` ✓ | `Date(08:10:00Z)` ✓ |
 * | `max(ts)` 裸聚合 | `"2026-09-21 08:10:00"` 字符串 ✗ | `Date(08:10:00Z)` ✓ |
 *
 * ## 修复
 *
 * 在 `drizzle()` **之后**覆写这两个 OID 的 parser。时序关键：drizzle 的
 * `construct()` 会无条件覆盖 `client.options.parsers`，因此必须先建 db 再调用本函数，
 * 否则覆写被抹掉（实测确认）。
 *
 * 只覆写 timestamp 两个 OID。`date`(1082) / `time`(1083) 不涉及本缺陷，
 * 且覆写会让 drizzle 的 `PgDateString` mapper 走 `toISOString().slice(0,-14)`
 * 分支，属于无收益的附带风险。
 */

/** 按 UTC 墙钟解释的时间列 OID：`timestamp`(1114) 与 `timestamptz`(1184) */
const TIMESTAMP_OIDS = [1114, 1184] as const

/**
 * 把驱动返回的时间戳字符串解析为 `Date`。
 *
 * - `timestamp`(1114) → DB 存的是 UTC 墙钟，补 `+0000`。
 * - `timestamptz`(1184) → PG 已按会话时区渲染并带 offset，直接解析。
 *
 * 已带时区标记（`Z` / `+08` / `+08:00`）时不重复追加，避免 `Invalid Date`。
 */
function parseTimestamp(val: string): Date {
  if (typeof val !== 'string') return val as unknown as Date
  if (/(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(val)) return new Date(val)
  // date-only（`YYYY-MM-DD`）缺时间部分，补齐再解析
  if (val.length <= 10) return new Date(`${val} 00:00:00+0000`)
  return new Date(`${val}+0000`)
}

interface ParserHost {
  options?: { parsers?: Record<number, (val: string) => unknown> }
}

/**
 * 修正 drizzle 之后残留的透明 timestamp parser。
 *
 * 必须在 `drizzle(client)` / `drizzlePglite(client)` 之后调用。
 * 对不具备 `options.parsers` 的客户端（如 PGlite）静默跳过 —— PGlite 走独立
 * 解析路径，不受此缺口影响。
 */
export function applyTimestampParsers(client: unknown): void {
  const parsers = (client as ParserHost)?.options?.parsers
  if (!parsers) return
  for (const oid of TIMESTAMP_OIDS) parsers[oid] = parseTimestamp
}
