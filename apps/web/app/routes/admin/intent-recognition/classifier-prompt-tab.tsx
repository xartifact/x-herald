import { useEffect, useState } from 'react'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  Skeleton,
  get,
  Textarea,
  put,
} from '@xartifact/x-herald-ui'
import { AlertCircle, Check, Save } from 'lucide-react'

interface ClassifierPromptData {
  content: string
  version: number
  updatedAt: string
  updatedBy: string | null
}

export function ClassifierPromptTab() {
  const queryClient = useQueryClient()
  const queryKey = ['settings', 'classifier-prompt']

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      return get<ClassifierPromptData>('/api/settings/classifier-prompt', {
        extractData: true,
      })
    },
  })

  const [draft, setDraft] = useState('')
  const [dirty, setDirty] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    if (data?.content && !dirty) {
      setDraft(data.content)
    }
  }, [data?.content, dirty])

  const mutation = useMutation({
    mutationFn: async (content: string) => {
      return put<ClassifierPromptData>('/api/settings/classifier-prompt', { content })
    },
    onSuccess: (resp) => {
      queryClient.setQueryData(queryKey, resp)
      setDirty(false)
      setSavedFlash(true)
      window.setTimeout(() => setSavedFlash(false), 2000)
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>加载分类器提示词失败</AlertTitle>
        <AlertDescription>{error instanceof Error ? error.message : '未知错误'}</AlertDescription>
      </Alert>
    )
  }

  const initial = data?.content ?? ''
  const version = data?.version ?? 0
  const updatedAt = data?.updatedAt ? new Date(data.updatedAt).toLocaleString('zh-CN') : '—'

  return (
    <div className="space-y-6">
      <PageHeader
        title="意图分类器提示词"
        description="分类器 LLM 的系统提示词。保存后版本号 +1，新请求立即生效，旧日志保留当时版本号。"
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono">
              v{version}
            </Badge>
            <span className="text-xs text-muted-foreground">{updatedAt}</span>
          </div>
        }
      />

      {mutation.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>保存失败</AlertTitle>
          <AlertDescription>
            {mutation.error instanceof Error ? mutation.error.message : '未知错误'}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">提示词内容</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            className="min-h-[420px] bg-muted/30 p-3 font-mono text-xs leading-relaxed resize-y"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setDirty(e.target.value !== initial)
            }}
            spellCheck={false}
          />
          <div className="flex items-center justify-between text-xs">
            <div className="text-muted-foreground">
              {draft.length.toLocaleString()} 字符 ·{' '}
              {dirty ? (
                <span className="text-warning">有未保存修改</span>
              ) : savedFlash ? (
                <span className="text-success inline-flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  已保存
                </span>
              ) : (
                <span>与已保存版本一致</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraft(initial)
                  setDirty(false)
                }}
                disabled={!dirty || mutation.isPending}
              >
                放弃修改
              </Button>
              <Button
                size="sm"
                onClick={() => mutation.mutate(draft)}
                disabled={!dirty || mutation.isPending || draft.trim().length === 0}
              >
                <Save className="mr-1 h-3.5 w-3.5" />
                {mutation.isPending ? '保存中…' : '保存为新版本'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">使用说明</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <p>
            模板支持 <code className="rounded bg-muted px-1">{'{categories}'}</code>{' '}
            占位符，运行时会被替换为该路由配置的意图类别列表。
          </p>
          <p>
            分类器调用 OpenAI 兼容端点的{' '}
            <code className="rounded bg-muted px-1">chat/completions</code>， 强制 JSON 输出（
            <code className="rounded bg-muted px-1">response_format: json_object</code>）。
          </p>
          <p>编辑器运行时缓存 30 秒；缓存外的更新需要重启 gateway。</p>
        </CardContent>
      </Card>
    </div>
  )
}
