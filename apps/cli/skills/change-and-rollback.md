# 变更与回滚

适用于改配置、加/删模型、改路由图的运维操作。核心原则：**先备份、后变更、可复现回滚**。

## 变更前（强制）

```bash
x-herald config export > before-$(date +%Y%m%d-%H%M%S).json
x-herald ping
x-herald logs stats-overview --start-date <今天>
```

记录基线：当前成功率、主要供应商延迟、活跃实例数。没有基线就无法判断变更是否引入退化。

## 变更分类与影响面

| 操作                 | 命令                                    | 影响面                           | 是否可热生效         |
| -------------------- | --------------------------------------- | -------------------------------- | -------------------- |
| 改供应商协议/密钥    | `providers update`                      | 该供应商全部实例                 | 是                   |
| 改实例配置/权重/协议 | `instances update` / `instances toggle` | 单个实例                         | 是                   |
| 改模型组能力         | `groups update`                         | 组内全部实例（逐层覆盖的基础层） | 是                   |
| 改组内顺序           | `groups reorder`                        | 该组路由优先级                   | 是                   |
| 改路由规则           | `rules save` + `rules activate`         | 该接入模型的全部路由             | 激活即重建内存匹配器 |
| 同步上游模型         | `providers sync-models`                 | 新增模型实例                     | 是                   |
| 改系统参数           | `settings update`                       | 全局（熔断/TTFB）                | 是                   |
| 导入配置             | `config import`                         | **全局**                         | 是，覆盖面大         |

## 推荐流程

```bash
# 1) 小步变更：一次只改一件事
x-herald instances update <id> --config '{"capabilityOverrides":{"vision":false}}'

# 2) 验证
x-herald instances test <id>
x-herald logs list --page-size 20            # 看新请求
x-herald metrics instances                   # 看成功率/TTFB 是否退化

# 3) 路由规则：先存草稿，再激活
x-herald rules save <accessModelId> --graph "$(cat graph.json)" --name "2026-11-05 视觉分流"
x-herald rules list <accessModelId>
x-herald rules activate <accessModelId> <versionId>
x-herald overview show | jq '. | length'
```

## 回滚

**首选：版本级回滚（路由）**

```bash
x-herald rules list <accessModelId>          # 找到上一个已知良好版本
x-herald rules activate <accessModelId> <previousVersionId>
```

**次选：字段级回滚（实例/组）**

```bash
x-herald instances update <id> --config '<旧值>'
```

**兜底：整库配置回滚**

```bash
x-herald config import --file-body "$(cat before-*.json)"
```

注意：`config import` 覆盖 providers / modelGroups / modelInstances / accessModels / virtualKeys /
gatewayConfigs。执行前确认备份文件的 `version` 与当前网关匹配，否则会被 400 拒绝。

## 变更后确认（缺一不可）

```bash
x-herald ping
x-herald metrics summary
x-herald cb states                    # 没有新增持续打开的熔断
x-herald logs stats-overview --start-date <今天>
x-herald metrics anomalies --unresolved true
```

## 风险提示

- `instances toggle` / `groups toggle` 会把实例/组整体摘出路由；若它是唯一可用候选，请求立即失败。
- `settings update --circuit-breaker` 影响全局熔断阈值，改小会更容易熔断。
- `config import` 是**一次性全局覆盖**，不要在工作时间无备份执行。
- 密钥轮换用 `keys reset`：明文只在响应中出现一次，务必即时取走。
