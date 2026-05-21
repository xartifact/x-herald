import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@x-llm-gateway/ui'
import { Layers, Plus } from 'lucide-react'

export const Route = createFileRoute('/admin/model-groups/')({
  component: ModelGroupsPage,
})

function ModelGroupsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['modelGroups'],
    queryFn: () => fetch('/api/model-groups').then(r => r.json()),
  })

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">模型组管理</h1>
        <Button><Plus className="mr-2 h-4 w-4" /> 添加模型组</Button>
      </div>
      {isLoading ? <p>加载中...</p> : (
        <div className="grid gap-4">
          {data?.data?.map((g: any) => (
            <Card key={g.id}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Layers className="h-5 w-5" />
                  <CardTitle>{g.name}</CardTitle>
                  <Badge variant={g.enabled ? 'default' : 'secondary'}>
                    {g.enabled ? '启用' : '禁用'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{g.description || ''}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
