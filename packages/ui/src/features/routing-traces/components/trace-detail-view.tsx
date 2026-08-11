import { useNavigate } from '@tanstack/react-router'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowDown,
  Ban,
  CheckCircle2,
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

function hasDecisionDetail(step: ChainStepLike): boolean {
  return !!step.intentName || (step.capabilities?.length ?? 0) > 0 || step.actionType === 'reject'
}

/** 意图/能力/拒绝节点的决策信息卡片——不管这一步最终有没有产出候选实例都要展示 */
function DecisionCard({ step }: { step: ChainStepLike }) {
  const isReject = step.actionType === 'reject'
  const isIntent = !!step.intentName
  const border = isReject
    ? 'border-l-destructive bg-destructive/5'
    : isIntent
      ? 'border-l-primary bg-primary/5'
      : 'border-l-accent-foreground/40 bg-accent/30'
  const Icon = isReject ? Ban : isIntent ? Sparkles : Layers
  const iconColor = isReject
    ? 'text-destructive'
    : isIntent
      ? 'text-primary'
      : 'text-muted-foreground'
  const title = isReject ? '规则拒绝' : isIntent ? '意图路由决策' : '能力路由决策'
  const subtitle = isReject
    ? '命中 reject 节点'
    : isIntent
      ? (INTENT_SOURCE_LABELS[step.intentSource ?? ''] ?? step.intentSource ?? '未知来源')
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
            {step.candidates.length === 0 && !isReject && (
              <div className="text-xs text-destructive mt-0.5">目标模型组无可用实例</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function RoutingTraceDetailView({ trace }: RoutingTraceDetailViewProps) {
  const navigate = useNavigate()
  const totalCandidates = trace.chain.flatMap((s) => s.candidates).length
  const attempted = trace.chain.flatMap((s) => s.candidates).filter((c) => c.matched).length
  const allCandidates = trace.chain.flatMap((s) => s.candidates)

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

        {/* Step 3-N: 链路候选执行（时间轴节点） */}
        {allCandidates.map((c, idx) => {
          const statusMeta = c.matched
            ? (STATUS_META[c.status ?? 'pending'] ?? STATUS_META.pending)
            : STATUS_META.pending
          const StatusIcon = statusMeta.icon
          const isFinal = trace.finalCandidate?.candidateIndex === c.candidateIndex
          const stepKindMeta = CHAIN_KIND_META[c.chainStepKind]
          const StepIcon = stepKindMeta.icon
          const step = trace.chain[c.chainStepIndex]
          const isFirstInStep =
            idx === 0 || allCandidates[idx - 1].chainStepIndex !== c.chainStepIndex
          const showDecision = isFirstInStep && step && hasDecisionDetail(step)

          return (
            <div key={c.candidateIndex}>
              {showDecision && step && (
                <>
                  <DecisionCard step={step} />
                  <TimelineConnector />
                </>
              )}
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
                          <span className="text-xs font-mono text-muted-foreground">
                            #{c.candidateIndex}
                          </span>
                          <StepIcon className={`h-3 w-3 ${stepKindMeta.text}`} />
                          <span className="text-xs text-muted-foreground">
                            {stepKindMeta.label}
                          </span>
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
                        {c.groupName && (
                          <div className="text-xs text-muted-foreground">{c.groupName}</div>
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
              {idx < allCandidates.length - 1 && <TimelineConnector />}
            </div>
          )
        })}

        {/* 路由在产出任何候选之前就结束的决策（reject / 目标组为空等）—— 这类 step 的
            candidates 恒为空，上面按候选遍历的循环天然不会渲染到它们 */}
        {trace.chain
          .filter((step) => step.candidates.length === 0 && hasDecisionDetail(step))
          .map((step) => (
            <div key={step.index}>
              <DecisionCard step={step} />
            </div>
          ))}

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
