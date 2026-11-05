# 成本巡检

目标：发现异常花费、定位来源、给出可执行结论（涨价 / 浪费 / 计费错）。

## 1. 总量与趋势

```bash
x-herald costs summary --start-date 2026-11-01
x-herald costs by-provider --start-date 2026-11-01
x-herald costs by-model --start-date 2026-11-01
x-herald costs by-key --start-date 2026-11-01
```

判读顺序：先 `summary` 看总盘子，再看 `by-provider` 找占比突变，最后 `by-key` / `by-model` 定位到人或模型。

## 2. 与用量交叉验证

成本 = 单价 × 用量。单价异常先查定价，再查用量。

```bash
x-herald costs pricing
x-herald keys list --page-size 200
x-herald keys usage <keyId>
x-herald logs stats-keys --period 7d --tz Asia/Shanghai
x-herald logs stats-providers --start-date 2026-11-01
```

要点：

- `logs stats-keys` 的 `--tz` 决定「今天」的边界，跨时区核对时显式传。
- `keys usage` 同时给限额余量；接近上限的密钥会先被限流而不是继续花钱。
- 成本按实例的 `costPer1kTokens` 累加；实例没配成本则该请求不计费 → 用 `instances list` 找空成本的实例。

## 3. 定位「贵而低价值」的流量

```bash
x-herald traces list --page-size 50 --outcome success
x-herald logs list --page-size 50 --request-category chat_image
x-herald logs client-models --start-date 2026-11-01
```

- `client-models` 显示客户端实际请求的模型名；与实际打到的高价实例对比，可发现「本该走便宜组」的流量。
- 含图片/视频输入的请求单价通常更高；按 `request-category` 分开看。

## 4. 定价维护

```bash
# 单条设置（USD / 1k tokens）
x-herald costs set-pricing --provider openai --input-per1k 0.0025 --output-per1k 0.01
x-herald costs pricing
```

定价是**成本核算**的口径，不影响路由；路由的成本优化策略读取的是实例级 `costPer1kTokens`。

## 5. 巡检结论模板

输出给人类时，包含四项：

1. 本期总成本与环比（`summary`）。
2. 成本占比 Top 3 供应商与 Top 3 模型（`by-provider` / `by-model`）。
3. 异常点：单价变更、用量突增的密钥、缺失定价的实例。
4. 建议动作：改权重、切组、补定价、限流（附具体命令）。

## 常见误判

- 只对比总量不看请求量：成本上涨可能只是流量上涨。
- 忽略缓存价：`cache_read` / `cache_write` 单价不同，`by-model` 汇总会掩盖这部分。
- 用 `--tz` 不一致的两个区间做环比，会得到虚假的「突增」。
