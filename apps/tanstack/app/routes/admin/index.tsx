import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, get } from '@x-llm-gateway/ui'

export function DashboardPage() {
  const { data: providersRes } = useQuery({
    queryKey: ['providers'],
    queryFn: () => get<{ data: unknown[] }>('/api/providers', { extractData: false }),
  })
  const { data: modelGroupsRes } = useQuery({
    queryKey: ['modelGroups'],
    queryFn: () => get<{ data: unknown[] }>('/api/model-groups', { extractData: false }),
  })
  const { data: keysRes } = useQuery({
    queryKey: ['keys'],
    queryFn: () => get<{ data: unknown[] }>('/api/keys', { extractData: false }),
  })

  const providerCount = (providersRes as { data?: unknown[] } | undefined)?.data?.length ?? 0
  const modelGroupCount = (modelGroupsRes as { data?: unknown[] } | undefined)?.data?.length ?? 0
  const keyCount = (keysRes as { data?: unknown[] } | undefined)?.data?.length ?? 0

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">仪表盘</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>提供商</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold" id="provider-count">{providerCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>模型组</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold" id="model-group-count">{modelGroupCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>API Keys</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold" id="key-count">{keyCount}</p></CardContent>
        </Card>
      </div>
    </div>
  )
}
