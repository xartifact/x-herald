import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowDown,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Globe,
  Layers,
  ShieldCheck,
  Sparkles,
  Zap,
  XCircle,
} from 'lucide-react'

import { Badge } from '../../../shared/components/ui/badge'
import { Button } from '../../../shared/components/ui/button'
import { Card, CardContent } from '../../../shared/components/ui/card'
import {
  FIELDS,
  STRING_OPERATORS,
  NUMERIC_OPERATORS,
} from '../../model-routes/components/property-panel/condition-fields'

import type { ReactNode } from 'react'
import type { RoutingTraceDetailResponse } from '../api'
type RouteConditionLike = NonNullable<
  NonNullable<RoutingTraceDetailResponse['matchedRule']>['conditions']
>[number]

const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  FIELDS.map((f) => [f.value, f.label]),
)
const OPERATOR_LABELS: Record<string, string> = Object.fromEntries(
  [...STRING_OPERATORS, ...NUMERIC_OPERATORS].map((o) => [o.value, o.label]),
)

/** 把一条路由条件格式化为可读文本，如 "是否流式 (context.streaming) 等于 (eq) true" */
function formatCondition(c: RouteConditionLike): string {
  const field = FIELD_LABELS[c.field] ?? c.field
  const operator = OPERATOR_LABELS[c.operator] ?? c.operator
  if (c.operator === 'exists') return `${field} ${operator}`
  return `${field} ${operator} ${String(c.value ?? '')}`
}

interface RoutingTraceDetailViewProps {
  trace: RoutingTraceDetailResponse
}

const CHAIN_KIND_META = {
  primary: {
    label: '主出口',
    icon: Activity,
    border: 'border-info/40',
    bg: 'bg-info/10',
    text: 'text-info',
  },
  backup: {
    label: '备出口',
    icon: ShieldCheck,
    border: 'border-primary/40',
    bg: 'bg-primary/10',
    text: 'text-primary',
  },
  single: {
    label: '单一出口',
    icon: ArrowRight,
    border: 'border-border',
    bg: 'bg-muted',
    text: 'text-muted-foreground',
  },
} as const

const INTENT_SOURCE_LABELS: Record<string, string> = {
  classifier: '分类器判定',
  fallback: '分类失败兜底',
  agent_directive: 'Agent 指令直连',
  model_name: '模型名匹配',
  capability: '能力匹配',
  default: '默认兜底',
}

const STATUS_META = {
  success: {
    label: '成功',
    icon: CheckCircle2,
    color: 'text-success',
    bg: 'bg-success/10',
    border: 'border-l-border',
  },
  failed: {
    label: '失败',
    icon: XCircle,
    color: 'text-destructive',
    bg: 'bg-destructive/10',
    border: 'border-l-destructive',
  },
  skipped: {
    label: '跳过',
    icon: AlertTriangle,
    color: 'text-warning',
    bg: 'bg-warning/10',
    border: 'border-l-border',
  },
  pending: {
    label: '未尝试',
    icon: Clock,
    color: 'text-muted-foreground',
    bg: 'bg-muted',
    border: 'border-l-border',
  },
} as const

function formatDuration(ms?: number): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

/** 时间轴垂直连接线 */
function TimelineConnector() {
  return (
    <div className="flex justify-center py-1">
      <ArrowDown className="h-4 w-4 text-muted-foreground" />
    </div>
  )
}

type ChainStepLike = RoutingTraceDetailResponse['chain'][number]

/**
 * 该 step 是否有值得展示的决策信息：
 *   - intent/capability/reject 节点（历史行为）
 *   - fallback 主备链双双失败且带上了每条腿的过滤原因（0 候选也要渲染决策卡，
 *     否则 "为什么这个组一个候选都没有" 在 UI 不可见）
 */
function hasDecisionDetail(step: ChainStepLike): boolean {
  return (
    !!step.intentName ||
    (step.capabilities?.length ?? 0) > 0 ||
    step.actionType === 'reject' ||
    (step.actionType === 'fallback' && (step.filteredOut?.length ?? 0) > 0)
  )
}

/** 意图路由决策依据展示——用户消息 + 分类器原始响应/置信度，回答"为什么命中该意图" */
function IntentEvidence({ step }: { step: ChainStepLike }) {
  const t = step.intentTrace
  if (!t) return null

  const rows: Array<{ label: string; value: ReactNode; mono?: boolean }> = []
  if (t.userMessage) rows.push({ label: '用户消息', value: t.userMessage })
  if (t.capabilities && t.capabilities.length > 0)
    rows.push({ label: '能力', value: t.capabilities.join('、') })
  if (t.confidence !== undefined)
    rows.push({
      label: '置信度',
      value: `${Math.round(t.confidence * 100)}%`,
      mono: true,
    })
  if (t.classifierCategory)
    rows.push({ label: '分类器输出', value: t.classifierCategory, mono: true })
  if (t.classifierRawResponse)
    rows.push({ label: '分类器原文', value: t.classifierRawResponse, mono: true })
  if (t.classifierModelName)
    rows.push({ label: '分类模型', value: t.classifierModelName, mono: true })
  if (t.classifierLatencyMs !== undefined)
    rows.push({ label: '分类耗时', value: formatDuration(t.classifierLatencyMs), mono: true })
  if (t.classifierStatusCode !== undefined && t.classifierStatusCode !== null)
    rows.push({ label: '分类器状态', value: String(t.classifierStatusCode), mono: true })

  if (rows.length === 0) return null

  return (
    <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 space-y-1 border border-border/60">
      {rows.map((r) => (
        <div key={r.label} className="flex gap-2 text-xs">
          <span className="text-muted-foreground flex-shrink-0 w-16">{r.label}</span>
          <span className={`text-foreground/90 min-w-0 break-words ${r.mono ? 'font-mono' : ''}`}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  )
}

/** 单个候选实例的渲染（状态/依据 + 右侧 HTTP 详情），被 StepGroup 复用 */
function CandidateCard({
  c,
  isFinal,
}: {
  c: RoutingTraceDetailResponse['chain'][number]['candidates'][number]
  isFinal: boolean
}) {
  const navigate = useNavigate()
  const statusMeta = c.matched
    ? (STATUS_META[c.status ?? 'pending'] ?? STATUS_META.pending)
    : STATUS_META.pending
  const StatusIcon = statusMeta.icon
  const stepKindMeta = CHAIN_KIND_META[c.chainStepKind]
  const StepIcon = stepKindMeta.icon

  return (
    <Card className={`border-l-4 ${isFinal ? 'border-l-success' : statusMeta.border}`}>
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between gap-3">
          {/* 左侧：候选序号 + 状态 */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full ${statusMeta.bg} flex-shrink-0`}
            >
              <StatusIcon className={`h-3.5 w-3.5 ${statusMeta.color}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono text-muted-foreground">#{c.candidateIndex}</span>
                <StepIcon className={`h-3 w-3 ${stepKindMeta.text}`} />
                <span className="text-xs text-muted-foreground">{stepKindMeta.label}</span>
                {isFinal && (
                  <Badge variant="default" className="text-[10px] h-4">
                    最终出口
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-sm font-medium truncate">{c.instanceName}</span>
                <span className="text-xs text-muted-foreground">@ {c.providerName}</span>
              </div>
              {c.groupName && <div className="text-xs text-muted-foreground">{c.groupName}</div>}
              {c.selectionReason && (
                <div className="text-[11px] text-muted-foreground/90 mt-0.5">
                  决策依据: {c.selectionReason}
                </div>
              )}
            </div>
          </div>

          {/* 右侧：HTTP 状态 + 耗时 + 请求详情链接 */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {c.matched ? (
              <>
                {c.statusCode !== undefined && (
                  <Badge
                    variant={c.statusCode < 400 ? 'default' : 'destructive'}
                    className="text-[10px] font-mono"
                  >
                    {c.statusCode}
                  </Badge>
                )}
                {c.failoverReason && (
                  <Badge variant="secondary" className="text-[10px]">
                    {c.failoverReason}
                  </Badge>
                )}
                <span className="text-xs font-mono text-muted-foreground">
                  {formatDuration(c.durationMs)}
                </span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">未执行</span>
            )}
            {c.requestLogId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() =>
                  navigate({
                    to: '/admin/logs/$logId',
                    params: { logId: c.requestLogId! },
                  })
                }
              >
                <ExternalLink className="h-3 w-3" />
                <span className="ml-1 text-xs">请求</span>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/** 把同 step 的候选 + 决策依据 + 过滤原因包装成可折叠容器（非首个 step 还会缩进） */
function StepGroup({
  step,
  isFirstStep,
  finalCandidateIndex,
}: {
  step: RoutingTraceDetailResponse['chain'][number]
  isFirstStep: boolean
  finalCandidateIndex?: number
}) {
  const [expanded, setExpanded] = useState(true)
  const stepKindMeta = CHAIN_KIND_META[step.kind]
  const StepIcon = stepKindMeta.icon
  const showDecision = hasDecisionDetail(step)
  const groupName = step.resolvedGroupName ?? step.resolvedGroupId ?? ''
  const filteredCount = step.filteredOut?.length ?? 0
  const attempted = step.candidates.filter((c) => c.matched).length
  const total = step.candidates.length

  return (
    <div className={isFirstStep ? '' : 'pl-4 sm:pl-6 border-l-2 border-border/50 ml-2'}>
      {/* step 头部：可折叠标题 + 计数 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full py-1.5 text-left hover:bg-muted/40 rounded-md px-2 transition-colors"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        )}
        <StepIcon className={`h-3.5 w-3.5 ${stepKindMeta.text} flex-shrink-0`} />
        <span className="text-xs font-medium">{stepKindMeta.label}</span>
        {groupName && (
          <Badge variant="outline" className="text-[10px] font-mono h-4">
            {groupName}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">
          {attempted}/{total} 已尝试
          {filteredCount > 0 && ` · ${filteredCount} 过滤`}
        </span>
        {step.decisionReason && (
          <span
            className="text-[11px] text-muted-foreground/90 truncate max-w-[420px]"
            title={step.decisionReason}
          >
            · {step.decisionReason}
          </span>
        )}
      </button>

      {expanded && (
        <div className="space-y-0 pt-1">
          {showDecision && (
            <>
              <DecisionCard step={step} />
              <TimelineConnector />
            </>
          )}
          {step.candidates.map((c, i) => (
            <div key={c.candidateIndex}>
              <CandidateCard c={c} isFinal={finalCandidateIndex === c.candidateIndex} />
              {step.filteredOut && step.filteredOut.length > 0 && i === 0 && (
                <div className="ml-9 mt-1 mb-1 rounded-md bg-muted/40 px-2 py-1 border border-border/50">
                  <div className="text-[11px] text-muted-foreground mb-0.5">
                    同组未入选（过滤原因）:
                  </div>
                  {step.filteredOut.map((r) => (
                    <div
                      key={r.instanceName}
                      className="text-[11px] text-foreground/80 flex gap-1.5"
                    >
                      <span className="font-mono flex-shrink-0">{r.instanceName}</span>
                      <span className="text-muted-foreground truncate">{r.reason}</span>
                    </div>
                  ))}
                </div>
              )}
              {i < step.candidates.length - 1 && <TimelineConnector />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
/** 意图/能力/拒绝节点的决策信息卡片——不管这一步最终有没有产出候选实例都要展示 */
function DecisionCard({ step }: { step: ChainStepLike }) {
  const isReject = step.actionType === 'reject'
  const isIntent = !!step.intentName
  const isFallbackFailed = step.actionType === 'fallback'
  const border = isReject
    ? 'border-l-destructive bg-destructive/5'
    : isIntent
      ? 'border-l-primary bg-primary/5'
      : isFallbackFailed
        ? 'border-l-destructive bg-destructive/5'
        : 'border-l-accent-foreground/40 bg-accent/30'
  const Icon = isReject ? Ban : isIntent ? Sparkles : isFallbackFailed ? XCircle : Layers
  const iconColor = isReject
    ? 'text-destructive'
    : isIntent
      ? 'text-primary'
      : isFallbackFailed
        ? 'text-destructive'
        : 'text-muted-foreground'
  const title = isReject
    ? '规则拒绝'
    : isIntent
      ? '意图路由决策'
      : isFallbackFailed
        ? '降级链失败'
        : '能力路由决策'
  const subtitle = isReject
    ? '命中 reject 节点'
    : isIntent
      ? (INTENT_SOURCE_LABELS[step.intentSource ?? ''] ?? step.intentSource ?? '未知来源')
      : isFallbackFailed
        ? (step.decisionReason ?? '主备链均未产出候选')
        : `命中能力: ${step.capabilities?.join('、')}`

  return (
    <Card className={`border-l-4 ${border}`}>
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Icon className={`h-4 w-4 ${iconColor}`} />
            <div>
              <div className="text-sm font-medium">{title}</div>
              <div className="text-xs text-muted-foreground">{subtitle}</div>
            </div>
          </div>
          <div className="text-right">
            {step.intentName && (
              <Badge variant="secondary" className="font-mono text-xs">
                {step.intentName}
              </Badge>
            )}
            {step.resolvedGroupName && (
              <div className="text-xs text-muted-foreground mt-0.5">→ {step.resolvedGroupName}</div>
            )}
            {step.candidates.length === 0 && !isReject && !isFallbackFailed && (
              <div className="text-xs text-destructive mt-0.5">目标模型组无可用实例</div>
            )}
          </div>
        </div>
        {/* 意图命中的完整依据：用户消息 + 分类器响应 */}
        {isIntent && <IntentEvidence step={step} />}
        {/* 降级链主备均失败：展示每条腿组内被过滤的实例及原因（vision not supported / 熔断...） */}
        {isFallbackFailed && (step.filteredOut?.length ?? 0) > 0 && (
          <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 space-y-1 border border-border/60">
            <div className="text-[11px] text-muted-foreground">主备链组内被过滤（未入选原因）:</div>
            {step.filteredOut!.map((r) => (
              <div key={`${r.instanceName}-${r.reason}`} className="flex gap-2 text-xs">
                <span className="font-mono flex-shrink-0 text-foreground/90">{r.instanceName}</span>
                <span className="text-muted-foreground">{r.reason}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function RoutingTraceDetailView({ trace }: RoutingTraceDetailViewProps) {
  const totalCandidates = trace.chain.flatMap((s) => s.candidates).length
  const attempted = trace.chain.flatMap((s) => s.candidates).filter((c) => c.matched).length

  return (
    <div className="space-y-1">
      {/* 时间轴：请求入口 → 路由决策 → 链路执行 → 最终出口 */}
      <div className="space-y-0">
        {/* Step 1: 请求入口 */}
        <Card className="border-l-4 border-l-muted-foreground">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">客户端请求入口</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(trace.createdAt).toLocaleString('zh-CN', { hour12: false })}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-mono font-medium">{trace.requestedModel}</div>
                <div className="text-xs text-muted-foreground">客户端请求模型</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <TimelineConnector />

        {/* Step 2: 接入模型解析 */}
        <Card className="border-l-4 border-l-info">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Zap className="h-4 w-4 text-info" />
                <div>
                  <div className="text-sm font-medium">接入模型解析</div>
                  {trace.matchedRule && (
                    <div className="text-xs text-muted-foreground">
                      命中规则: <span className="font-medium">{trace.matchedRule.name}</span>
                    </div>
                  )}
                  {trace.matchedRule?.conditions && trace.matchedRule.conditions.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      {trace.matchedRule.conditions.map((c) => (
                        <div
                          key={`${c.field}-${c.operator}-${String(c.value)}`}
                          className="flex items-center gap-1"
                        >
                          <Badge variant="outline" className="text-[10px] font-mono h-4">
                            条件
                          </Badge>
                          <span>{formatCondition(c)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-mono font-medium">{trace.accessModelName}</div>
                <div className="text-xs text-muted-foreground">接入模型</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <TimelineConnector />

        {/* Step 3-N: 链路步骤（按 step 分组，可折叠；非首个 step 缩进显示从属关系） */}
        {trace.chain.map((step, stepIdx) => (
          <div key={step.index}>
            <StepGroup
              step={step}
              isFirstStep={stepIdx === 0}
              finalCandidateIndex={trace.finalCandidate?.candidateIndex}
            />
            {stepIdx < trace.chain.length - 1 && step.candidates.length > 0 && (
              <TimelineConnector />
            )}
          </div>
        ))}

        {/* 路由在产出任何候选之前就结束的决策（reject / 目标组为空 / 降级链主备均失败等）——
            这类 step 的 candidates 恒为空，StepGroup 内部已通过 hasDecisionDetail 渲染决策卡，
            无需在此重复渲染。 */}
        {null}

        {/* 最终出口 */}
        {trace.outcome === 'success' && trace.finalCandidate && (
          <>
            <TimelineConnector />
            <Card className="border-l-4 border-l-success bg-success/10">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <div>
                      <div className="text-sm font-medium">请求完成</div>
                      <div className="text-xs text-muted-foreground">
                        经 {attempted} 次尝试后成功
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono font-medium">
                      {formatDuration(trace.totalDurationMs)}
                    </div>
                    <div className="text-xs text-muted-foreground">总耗时</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* 规则主动拒绝 */}
        {trace.outcome === 'rejected' && (
          <>
            <TimelineConnector />
            <Card className="border-l-4 border-l-destructive bg-destructive/10">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Ban className="h-4 w-4 text-destructive" />
                    <div>
                      <div className="text-sm font-medium">请求被拒绝</div>
                      {trace.errorMessage && (
                        <div className="text-xs text-muted-foreground">{trace.errorMessage}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono font-medium">
                      {formatDuration(trace.totalDurationMs)}
                    </div>
                    <div className="text-xs text-muted-foreground">总耗时</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* 请求仍在进行中：流式请求落库的中间态，尚无终态（不是失败，也不是成功） */}
        {trace.outcome === 'pending' && (
          <>
            <TimelineConnector />
            <Card className="border-l-4 border-l-muted-foreground bg-muted/40">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">请求进行中</div>
                      <div className="text-xs text-muted-foreground">
                        尚未收到最终结果，可能仍在处理，也可能因客户端断开/进程重启而卡在此状态
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* 无可用实例 / 全部候选失败 */}
        {trace.outcome === 'all_failed' && (
          <>
            <TimelineConnector />
            <Card className="border-l-4 border-l-destructive bg-destructive/10">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <XCircle className="h-4 w-4 text-destructive" />
                    <div>
                      <div className="text-sm font-medium">请求失败</div>
                      <div className="text-xs text-muted-foreground">
                        {totalCandidates > 0
                          ? `尝试 ${attempted}/${totalCandidates} 个候选后全部失败`
                          : (trace.errorMessage ?? '路由未产出任何候选实例')}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono font-medium">
                      {formatDuration(trace.totalDurationMs)}
                    </div>
                    <div className="text-xs text-muted-foreground">总耗时</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
