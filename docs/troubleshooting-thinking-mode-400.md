# 排障手册：Thinking 模式 400 — reasoning_content

> 关联 skill: `.claude/skills/debugging-thinking-mode-400/SKILL.md`
> 状态: 2026-08-14 生产事故复盘沉淀

## 1. 错误现象

**上游 400 响应：**

```
400 [invalid_request_error] The `reasoning_content` in the thinking mode must be passed back to the API.
(type=provider_error param=provider_error)
```

**触发条件：**

- 请求 `reasoning_effort` 非默认（thinking 模式开启）
- 多轮对话或 tool-call 密集会话（历史含大量 assistant 消息）
- 客户端为 OpenAI SDK（不识别/丢弃 `reasoning_content` 字段）

**本地捕获：** omp 会在 `~/.omp/logs/http-400-requests/*.json` 存下原始请求与错误响应。

## 2. 根因

Kimi / DeepSeek 系 thinking 模型强制校验：**历史中每条 assistant 消息必须携带 `reasoning_content`**。
OpenAI SDK 客户端不识别该字段，多轮后历史里全是缺失的 assistant 消息 → 上游 400。

x-herald 的修复机制：实例级配置 `patchMissingReasoningContent: true`，
在 egress 阶段自动为缺失的 assistant 消息注入 `reasoning_content: ''`：

- 补丁逻辑: `apps/gateway/src/gateway/transformer/protocols/openai/egress.ts` L89-96
- 配置来源: `model_instances.config`（JSONB）
- 生效时机: **按请求从 DB 读取，无需重启**（`handlers/openai/chat-completion-executor.ts` L130）

## 3. 事故案例（2026-08-14 生产）

| 项       | 值                                                                                                                |
| -------- | ----------------------------------------------------------------------------------------------------------------- |
| 环境     | x99 (100.80.110.125), 容器 `x-herald`                                                                             |
| 入口模型 | `Plan`（access_model）                                                                                            |
| 请求     | `reasoning_effort: "xhigh"`, stream, 42 条 assistant 消息全缺 reasoning_content                                   |
| 路由     | Plan → intent → 降级链 primary `Deepseek-v4-flash` 组                                                             |
| 选中实例 | `DeepSeek-V4-Flash-0731` (X-AIO) — priority 0, enabled, **config null**                                           |
| 未选中   | `deepseek-v4-flash` (DeepSeek) — 有补丁但 **enabled=false**；`DeepSeek-V4-Flash` (X-AIO) — 有补丁但 enabled=false |

**核心教训：唯一可用的实例恰好是唯一缺补丁的实例。**
router-selector 按 `priority` 升序 + `enabled` 过滤选择；组内两个开补丁的实例都被禁用，
唯一启用的 0731 恰好 config 为 null → 100% 命中 400。

## 4. 排查路径（6 步，先确认再动手）

```text
1. 捕获文件（omp logs）→ model, reasoning_effort, messages
2. access_models → 按 name 查 id        (route_rules.access_model_id)
3. route_rules.graph → 完整动作链       (intent/fallback/target 可能指向多个组)
4. model_group_memberships → 目标组实例 (priority/weight/enabled)
5. model_instances.config → 是否有 patchMissingReasoningContent
6. request_attempts → 实际 400 落在哪个 instance_id（勿假设，用日志证实）
```

## 5. 生产诊断命令

容器内 `packages/db/node_modules/postgres` 可用，Bun 一行脚本直连 DB：

```bash
# 脚本经 stdin 传入，规避本地 shell 转义（fish/zsh 会吞 $ 与 $$）
ssh tailscale.x99-arch-server.local 'bash -s' < /tmp/diag.sh
```

```js
// /tmp/diag.sh 内容（docker exec x-herald sh -c 'cd /app/packages/db && bun -e "..."'）
import postgres from 'postgres'
const sql = postgres({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 1,
  onnotice: () => {},
})
const q = (s, a) => sql.unsafe(s, a)

// 1) 接入模型
await q('select id, name, enabled from access_models where deleted_at is null and name ilike $1', [
  '%Plan%',
])
// 2) 路由图（active）
await q('select id, name, active, graph from route_rules where access_model_id = $1', ['<AM_ID>'])
// 3) 目标组实例 + 优先级 + 配置
await q(
  'select mi.id, mi.name, mi.priority, mi.weight, mi.enabled, mi.config, p.name as provider from model_group_memberships mgm join model_instances mi on mi.id = mgm.instance_id left join providers p on p.id = mi.provider_id where mgm.group_id = $1',
  ['<GROUP_ID>'],
)
// 4) 实际失败实例（近 24h）
await q(
  'select ra.instance_id, ra.provider_name, ra.status_code, ra.created_at from request_attempts ra where ra.created_at >= now() - interval $1 and ra.provider_response_body::text ilike $2 order by ra.created_at desc limit 10',
  ['24 hours', '%reasoning_content%'],
)
```

**引号陷阱（踩过）**：`$$`（dollar-quote）会被 shell 吞掉 → 报 `unterminated dollar-quoted string`；
优先用 `sql.unsafe` + 绑定参数，避免在 SQL 里写 `$$...$$`。

## 6. 修复

```sql
UPDATE model_instances
SET config = '{"patchMissingReasoningContent": true}', updated_at = now()
WHERE id = '<INSTANCE_ID>';   -- 数据修复 = DML，不碰迁移体系
```

**无需重启容器**（config 按请求读取）。验证：

```sql
-- 该实例最近请求应全为 200
select ra.created_at, ra.status_code from request_attempts ra
where ra.instance_id = '<INSTANCE_ID>' order by ra.created_at desc limit 5;

-- 无新错误
select count(*), max(created_at) from request_logs
where created_at >= now() - interval '30 minutes'
  and error_message ilike '%reasoning_content%';
```

## 7. 预防与遗留风险

- **新 thinking 实例默认不继承补丁配置** → 建议 UI 创建表单或 schema 层为 thinking 模型默认开启
- **单点故障**：组内仅一个启用实例时，该实例故障 = 整组不可用；评估启用备份实例
- **多 provider 同名实例**：补丁/排查一律按 UUID，不按 name
- **DML/DDL 边界**：改 config 是数据修复（UPDATE），schema 变更仍必须走 `packages/db/migrations/`
