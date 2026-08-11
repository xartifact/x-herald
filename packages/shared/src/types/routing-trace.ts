import type { RouteActionType, RouteCondition } from './model-route'

/**
 * 路由链路追踪 (Routing Trace) 类型定义
 *
 * 用途：记录每次客户端请求的完整路由链路 ——
 *   哪些候选实例被生成（来自哪个 chain step / 主备哪个）？
 *   每个候选实例的实际 outcome（attempts / 成功 / 跳过 / 失败原因）？
 *   最终是哪一步的哪个候选胜出？
 *
 * 存储位置：request_logs.metadata.routing.routeChain (JSONB)
 *
 * 与 request_attempts 的关系：
 *   - request_attempts 记录每个 attempt 的 HTTP 层细节（status_code, ttfb, body, headers）
 *   - routeChain 记录计划链路（哪些候选，按什么顺序）
 *   - 二者通过 candidateIndex 关联（0-based 全局序号，跨 primary/backup）
 */

/** 一个候选实例在路由链路中的描述 */
export interface ChainCandidate {
  /** 全局 0-based 序号（跨 primary/backup 单调递增） */
  candidateIndex: number
  /** 所属 chain step 在 chain[] 中的索引 */
  chainStepIndex: number
  /** 主备链中的位置 */
  chainStepKind: 'primary' | 'backup' | 'single'
  instanceId: string
  instanceName: string
  providerId: string
  providerName: string
  priority: number
  /** 路由策略（如 priority / least-latency / cost-optimized） */
  strategy: string
  /** 模型组名称（便于直接阅读） */
  groupName: string
  /** 是否被实际尝试（true 即使最终失败也尝试过） */
  matched: boolean
  /** 实际尝试结果 */
  status?: 'success' | 'failed' | 'skipped'
  statusCode?: number
  /** failover 原因（如 http_5xx / ttfb_timeout / network_error / invalid_response） */
  failoverReason?: string
  /** 该次实际尝试耗时（ms） */
  durationMs?: number
}

/** 主备链中的一个 step */
export interface ChainStep {
  /** chain[] 中的索引 */
  index: number
  /** 主备位置（fallback 节点生成的 step 是 'primary' / 'backup'，其他都是 'single'） */
  kind: 'primary' | 'backup' | 'single'
  /** 路由动作类型 */
  actionType: RouteActionType
  /** 解析后的目标模型组 ID（如有） */
  resolvedGroupId?: string
  resolvedGroupName?: string
  /** 意图路由特有（kind=single, actionType=intent） */
  intentName?: string
  intentSource?: string
  /** 能力路由特有 */
  capabilities?: string[]
  /** 此 step 产出的候选实例 */
  candidates: ChainCandidate[]
}

/** 完整的路由链路追踪 */
export interface RoutingTrace {
  /** 客户端原始请求的模型名 */
  requestedModel: string
  /** 解析到的接入模型 */
  accessModelId?: string
  accessModelName?: string
  /** 命中的路由规则 */
  matchedRule?: {
    id: string
    name: string
    priority: number
    /** 命中该规则前经过的条件链（条件节点） */
    conditions?: RouteCondition[]
  }
  /** 链路步骤（按执行顺序） */
  chain: ChainStep[]
  /** 最终 outcome */
  outcome: 'success' | 'rejected' | 'all_failed'
  /** 胜出的候选（success 时一定有） */
  finalCandidate?: {
    chainStepIndex: number
    chainStepKind: 'primary' | 'backup' | 'single'
    candidateIndex: number
    instanceId: string
    instanceName: string
    providerId: string
    providerName: string
  }
  /** 实际尝试的总次数 */
  totalAttempts: number
  /** 从路由开始到全部结束的总耗时（ms） */
  totalDurationMs: number
}

/**
 * 路由链路查询结果（单条 log 对应一条 trace）
 */
export interface RoutingTraceSummary {
  logId: string
  requestGroupId: string
  requestedModel: string
  accessModelId?: string
  accessModelName?: string
  matchedRuleId?: string
  matchedRuleName?: string
  matchedRulePriority?: number
  outcome: 'success' | 'rejected' | 'all_failed'
  finalProviderName?: string
  finalInstanceName?: string
  finalChainKind?: 'primary' | 'backup' | 'single'
  totalAttempts: number
  totalDurationMs: number
  /** 完整链路（仅 summary → detail 时返回） */
  trace?: RoutingTrace
  createdAt: string
  /** 链接回原 request_log */
  requestLogId: string
}
