import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Sparkles, Wrench, AlertCircle, Loader2 } from 'lucide-react'

import { useLogs } from '../../../hooks/logs'
import type { LogListItem } from '@xartifact/x-llm-gateway-shared'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  get,
  post,
} from '@xartifact/x-llm-gateway-ui'

interface FixSuggestion {
  action: 'update_config' | 'remove_parameter' | 'add_parameter' | 'modify_transform' | 'add_header'
  field: string
  value?: unknown
  reason: string
  autoApplicable: boolean
}

interface DiagnosisData {
  rootCause: string
  errorCategory: string
  suggestions: FixSuggestion[]
  confidence: number
  instanceId: string | null
}

interface PatternItem {
  errorType: string
  provider: string
  model: string
  count: number
  fix: unknown
}

const CATEGORY_LABELS: Record<string, string> = {
  param_error: '参数错误',
  auth_error: '认证错误',
  rate_limit: '速率限制',
  provider_issue: '服务商问题',
  config_issue: '配置问题',
  unknown: '未知',
}

const CATEGORY_VARIANTS: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  param_error: 'default',
  auth_error: 'destructive',
  rate_limit: 'secondary',
  provider_issue: 'outline',
  config_issue: 'default',
  unknown: 'secondary',
}

export function AiAssistPage() {
  const queryClient = useQueryClient()
  const [logId, setLogId] = useState('')
  const [diagnosis, setDiagnosis] = useState<DiagnosisData | null>(null)

  const { data: logsData, isLoading: logsLoading } = useLogs({ status: 'failure', pageSize: '10' })
  const failureLogs = useMemo(() => {
    const res = logsData as { data?: LogListItem[] } | undefined
    return res?.data ?? []
  }, [logsData])

  const { data: patternsData, isLoading: patternsLoading } = useQuery({
    queryKey: ['ai-assist-patterns'],
    queryFn: () =>
      get<{ success: boolean; data: PatternItem[] }>('/api/ai/patterns', { extractData: false }),
  })
  const patterns = patternsData?.data ?? []

  const diagnoseMutation = useMutation({
    mutationFn: (id: string) =>
      post<{ success: boolean; data: DiagnosisData }>(
        '/api/ai/diagnose',
        { logId: id },
        { extractData: false },
      ),
    onSuccess: (res) => {
      if (res.success) {
        setDiagnosis(res.data)
      } else {
        toast.error('诊断失败')
      }
    },
    onError: (error: unknown) => {
      const apiError = error as { status?: number; data?: { error?: string; code?: string } }
      const status = apiError.status ? `(${apiError.status})` : ''
      toast.error(`${status} ${apiError.data?.error || '诊断请求失败，请稍后重试'}`)
    },
  })

  const applyFixMutation = useMutation({
    mutationFn: (payload: {
      instanceId: string
      suggestion: FixSuggestion
      errorType: string
      provider: string
      model: string
    }) => post<{ success: boolean }>('/api/ai/apply-fix', payload, { extractData: false }),
    onSuccess: () => {
      toast.success('修复已应用')
      queryClient.invalidateQueries({ queryKey: ['ai-assist-patterns'] })
    },
    onError: (error: unknown) => {
      const apiError = error as { data?: { error?: string } }
      toast.error(apiError.data?.error || '应用修复失败')
    },
  })

  const handleDiagnose = () => {
    if (!logId.trim()) {
      toast.error('请输入日志 ID')
      return
    }
    setDiagnosis(null)
    diagnoseMutation.mutate(logId.trim())
  }

  const handleApplyFix = (suggestion: FixSuggestion) => {
    if (!diagnosis?.instanceId) {
      toast.error('缺少实例 ID，无法应用修复')
      return
    }
    applyFixMutation.mutate({
      instanceId: diagnosis.instanceId,
      suggestion,
      errorType: diagnosis.errorCategory,
      provider: 'unknown',
      model: 'unknown',
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-purple-600" />
          AI 错误诊断
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>选择请求日志</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="logId">日志 ID</Label>
              <Input
                id="logId"
                placeholder="输入日志 ID"
                value={logId}
                onChange={(e) => setLogId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>或选择最近错误</Label>
              <Select
                value={logId}
                onValueChange={(value) => setLogId(value)}
                disabled={logsLoading || failureLogs.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择最近失败的请求" />
                </SelectTrigger>
                <SelectContent>
                  {failureLogs.map((log) => (
                    <SelectItem key={log.id} value={log.id}>
                      <span className="truncate max-w-[320px]" title={log.errorMessage || log.id}>
                        {log.modelName}
                        {' · '}
                        {log.errorType ||
                          (log.errorMessage
                            ? log.errorMessage.slice(0, 40) +
                              (log.errorMessage.length > 40 ? '...' : '')
                            : 'unknown')}
                        {' · '}
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleDiagnose} disabled={diagnoseMutation.isPending || !logId.trim()}>
              {diagnoseMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              AI 诊断
            </Button>
          </div>
        </CardContent>
      </Card>

      {diagnosis && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              诊断结果
              <Badge variant={CATEGORY_VARIANTS[diagnosis.errorCategory] ?? 'secondary'}>
                {CATEGORY_LABELS[diagnosis.errorCategory] ?? diagnosis.errorCategory}
              </Badge>
              <span className="ml-auto text-sm font-normal text-muted-foreground">
                置信度 {(diagnosis.confidence * 100).toFixed(0)}%
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">根因分析</h3>
              <p className="mt-1 text-base">{diagnosis.rootCause}</p>
            </div>

            {diagnosis.suggestions.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">修复建议</h3>
                <div className="grid gap-3">
                  {diagnosis.suggestions.map((s) => (
                    <div key={`${s.action}-${s.field}`} className="rounded-lg border p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Wrench className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{s.action}</span>
                          <Badge variant="outline">{s.field}</Badge>
                          {s.autoApplicable && <Badge variant="default">可自动应用</Badge>}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!s.autoApplicable || applyFixMutation.isPending}
                          onClick={() => handleApplyFix(s)}
                        >
                          {applyFixMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          应用修复
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground">{s.reason}</p>
                      {s.value !== undefined && (
                        <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                          {JSON.stringify(s.value, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>常见错误模式</CardTitle>
        </CardHeader>
        <CardContent>
          {patternsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中...
            </div>
          ) : patterns.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无已学习的错误模式</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>错误类型</TableHead>
                  <TableHead>服务商</TableHead>
                  <TableHead>模型</TableHead>
                  <TableHead>出现次数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patterns.map((p) => (
                  <TableRow key={`${p.errorType}-${p.provider}-${p.model}`}>
                    <TableCell>{p.errorType}</TableCell>
                    <TableCell>{p.provider}</TableCell>
                    <TableCell>{p.model}</TableCell>
                    <TableCell>{p.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
