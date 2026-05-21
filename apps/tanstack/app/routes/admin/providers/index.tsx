import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@x-llm-gateway/ui'
import { Plus, Server } from 'lucide-react'

export const Route = createFileRoute('/admin/providers/')({
  component: ProvidersPage,
})

function ProvidersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['providers'],
    queryFn: () => fetch('/api/providers').then(r => r.json()),
  })

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">提供商管理</h1>
        <Button><Plus className="mr-2 h-4 w-4" /> 添加提供商</Button>
      </div>
      {isLoading ? <p>加载中...</p> : (
        <div className="grid gap-4">
          {data?.data?.map((p: any) => (
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Server className="h-5 w-5" />
                  <CardTitle>{p.name}</CardTitle>
                  <Badge variant={p.enabled ? 'default' : 'secondary'}>
                    {p.enabled ? '启用' : '禁用'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{p.baseUrl}</p>
                <p className="text-sm">协议: {p.protocol} · 模型数: {p.models?.length || 0}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
