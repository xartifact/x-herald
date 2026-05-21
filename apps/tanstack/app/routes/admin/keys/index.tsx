import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@x-llm-gateway/ui'
import { Key, Plus } from 'lucide-react'

export const Route = createFileRoute('/admin/keys/')({
  component: KeysPage,
})

function KeysPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['keys'],
    queryFn: () => fetch('/api/keys').then(r => r.json()),
  })

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">API Keys 管理</h1>
        <Button><Plus className="mr-2 h-4 w-4" /> 添加 Key</Button>
      </div>
      {isLoading ? <p>加载中...</p> : (
        <div className="grid gap-4">
          {data?.data?.map((k: any) => (
            <Card key={k.id}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Key className="h-5 w-5" />
                  <CardTitle>{k.name}</CardTitle>
                  <Badge variant={k.enabled ? 'default' : 'secondary'}>
                    {k.enabled ? '启用' : '禁用'}
                  </Badge>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
