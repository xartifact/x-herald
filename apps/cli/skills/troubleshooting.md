# 故障排查

目标：在最短步骤内回答「哪个环节坏了、影响多大、怎么恢复」。

## 0. 分层定位（先只读）

```bash
x-herald ping                      # 进程 + 数据库连通性
x-herald auth whoami               # 401 时先确认 tokenSource 与 expiresAt
x-herald groups list               # 模型组是否 enabled
x-herald groups instances          # 实例 enabled / status
```

判读：

- `ping` 非 200 或 `database != "connected"` → 基础设施问题，停止后续排查。
- `auth whoami` 返回 401 → 重新 `auth login`；`identity.role` 非 `admin` → 凭据不对。

## 1. 请求失败归因

```bash
x-herald logs list --status failure --page-size 20
x-herald logs get <logId>
x-herald traces list --outcome all_failed --page-size 20
x-herald traces get <logId>
```

要点：

- `logs get` 的 `targetProtocol` / `provider` / `instance` 说明请求实际打到哪。
- `traces get` 的 `routeChain` 与 `rejections` 说明为什么**没**选某个实例（常见：
  `streaming not supported`、`vision not supported`、`circuit breaker open`、`instance status is down`）。
- 若 rejection 是能力类且与预期不符：实例 `modelType` 决定了适用能力（embedding 不支持流式/工具），
  或某层显式写了 `false`。

## 2. 健康与熔断

```bash
x-herald metrics instances
x-herald metrics providers
x-herald metrics anomalies --unresolved true
x-herald cb states
x-herald cb events --limit 50
```

判读：

- `metrics instances` 的 `success_rate`、`ttfb_p95` 与基线比较；异常实例会被 `metrics anomalies` 标出。
- `cb states` 是内存实时状态；`cb events` 是历史。二者不一致时以 `states` 为准判断「现在是否还在熔断」。

## 3. 单实例验证

```bash
x-herald instances test <instanceId>
x-herald providers models <providerId>
```

`instances test` 直接用实例配置打上游，能区分「网关配置错」与「上游不可用」。
`providers models` 拉上游 `/models`，失败时看 `fetchError`。

## 4. 常见故障与处置

| 现象                                           | 先查                                | 处置                                                           |
| ---------------------------------------------- | ----------------------------------- | -------------------------------------------------------------- |
| 401 `Missing or invalid authorization header`  | `auth whoami`                       | `auth login` 重新取 token                                      |
| 400 `Protocol 'x' not configured for provider` | `providers get <id>` 的 `protocols` | 启用对应协议或改实例 `protocol`                                |
| 400 能力类报错                                 | 实例 `modelType` + 三层能力         | 修正 `model-type` 或去掉不适用的覆盖                           |
| 全部候选失败                                   | `traces get` 的 `rejections`        | 按 rejection 原因修（熔断优先 `cb reset`）                     |
| 熔断持续打开                                   | `cb states` / `cb stats`            | `cb reset <instanceId>` 后观察是否立刻重新打开（说明上游仍坏） |
| 上游 429/5xx 大面积                            | `logs stats-providers`              | 临时提高权重到健康实例，或降级到备用组                         |
| 日志表膨胀                                     | `logs stats-storage`                | 确认保留期后 `logs cleanup --retention-days N`                 |

## 5. 需要 AI 辅助时

```bash
x-herald ai diagnose --log-id <logId>
x-herald ai diagnose-stream --log-id <logId>   # SSE，边生成边输出
x-herald ai patterns                            # 已沉淀的错误模式
```

`ai apply-fix` 会**写入配置**；先看诊断结论，必要时先 `config export`。

## 结束条件

- 有明确的失败环节（基础设施 / 鉴权 / 路由 / 上游 / 熔断），而不是「大概」。
- 处置后 `ping` 正常、`logs stats-overview` 成功率回升、`cb states` 无持续打开。
