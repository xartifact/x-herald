# x-herald CLI 运维

用 `x-herald` CLI 运维 x-herald LLM 网关。本目录面向**通用编码/运维 Agent**（Claude Code、Codex、OpenCode、Pi 等），
不依赖任何特定客户端约定：所有结论都能用列出的命令复现。

## 先决条件

- 网关可达：`X_HERALD_URL`（默认 `http://localhost:3000`）
- 管理员凭据：`x-herald auth login` 换取 JWT 并落盘（`~/.config/x-herald/config.json`，权限 0600）

认证三级回退，优先级从高到低：

1. `--token <jwt>`（或 `X_HERALD_TOKEN`）
2. `X_HERALD_TOKEN` 环境变量
3. `x-herald auth login` 落盘的 token

`--api-key` / `X_HERALD_API_KEY` 是**虚拟密钥**，只对 `/api/v1` 生效，不能用于管理 API。
`x-herald auth whoami` 会显示当前 `tokenSource`（`flag` / `env` / `config` / `none`），排查 401 先看它。

## 输出契约（给 Agent 的硬约定）

- 默认 `--format json`：stdout **只有** payload（`{success,data}` 已解包），可直接 `| jq`。
- 列表类端点（带游标/分页）保留信封：用 `--format json` 时会看到 `data`、`nextCursor`、`hasMore`。
- `--format table` **仅供人看**，列宽与列名不保证稳定，Agent 不要解析。
- 进度、警告、错误一律走 stderr，不污染 stdout。
- 退出码：`0` 成功；`1` 失败（HTTP 错误、参数缺失、未认证）。错误信息形如
  `HTTP 401: Missing or invalid authorization header (run ...)`。

## 命令地图

| 领域 | 命令组 | 典型用途 |
|---|---|---|
| 上游 | `providers` | 增删改供应商、拉取上游模型、同步为实例、thinking 映射 |
| 路由配置 | `groups` / `instances` | 模型组与实例、组内排序、能力覆盖、连通性测试 |
| 客户端 | `access` / `rules` / `overview` | 接入模型、路由版本（图）、全局路由总览 |
| 鉴权 | `keys` | 虚拟密钥、限流、用量、轮换 |
| 观测 | `logs` / `metrics` / `traces` / `cb` | 请求日志、指标、路由追踪、熔断器 |
| 成本 | `costs` | 汇总、按密钥/供应商/模型、定价 |
| 系统 | `settings` / `workspaces` / `config` | 系统参数、工作区、配置导入导出 |
| AI | `ai` | 日志诊断、按自然语言生成实例配置 |
| 兜底 | `api` | 任意端点：`x-herald api <METHOD> <PATH>` |

发现新端点或本文未覆盖的端点，用 `api` 兜底；`--dry-run` 可先看将发出的请求。

## 高频操作

```bash
# 健康与身份
x-herald ping
x-herald auth login
x-herald auth whoami

# 供应商 → 实例
x-herald providers list
x-herald providers create --name openai \
  --protocols '{"openai":{"baseUrl":"https://api.openai.com/v1","enabled":true}}' \
  --api-key sk-...
x-herald providers models <providerId>
x-herald providers sync-models <providerId> --models '[{"id":"gpt-4o","name":"gpt-4o"}]'

# 模型组与实例（capabilities 稀疏：缺省=继承上层）
x-herald groups create --name gpt-4o --category chat --capabilities '{"streaming":true}'
x-herald instances create --provider-id <pid> --name gpt-4o-openai \
  --actual-model-name gpt-4o --model-type text_generation --protocol openai \
  --group-ids '["<gid>"]'
x-herald instances test <instanceId>

# 观测
x-herald logs list --page-size 20 --status failure
x-herald logs get <logId>
x-herald logs stats-overview --start-date 2026-11-01
x-herald cb states
x-herald traces list --outcome all_failed

# 成本
x-herald costs summary --start-date 2026-11-01
x-herald costs by-provider --start-date 2026-11-01

# 配置备份 / 恢复
x-herald config export > backup.json
x-herald config import --file-body "$(cat backup.json)"
```

## 场景手册

- 排障（5xx / 超时 / 全部候选失败）：[`troubleshooting.md`](./troubleshooting.md)
- 变更与回滚（配置改动、发布前后检查）：[`change-and-rollback.md`](./change-and-rollback.md)
- 成本巡检（异常花费、定价、用量核对）：[`cost-audit.md`](./cost-audit.md)

## 安全边界

- 只读排查优先；`delete`、`toggle`、`cleanup`、`import`、`cb trip` 会改变线上行为，先确认再执行。
- 配置变更前先 `x-herald config export > before.json`，回滚用同一份导入。
- 不要把 JWT 或虚拟密钥写进仓库、日志或对话；`auth whoami` 刻意不打印 token。

## 机器可读索引

`commands.json` 由 `src/spec-commands.ts` 生成，列出每个命令的 `command`、`method`、`path`、`description`、
`args` 与 `options`（含 `in: query|body`）。Agent 应优先查它而不是解析 `--help`：

```bash
jq '.commands[] | select(.command | contains("instances create"))' skills/commands.json
```

改完 spec 表后执行 `bun run gen:commands`；`src/command-index.test.ts` 会在两者不一致时失败。
