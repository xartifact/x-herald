import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@x-llm-gateway/ui'

export const Route = createFileRoute('/admin/')({
  component: DashboardPage,
})

function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">仪表盘</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>提供商</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold" id="provider-count">-</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>模型组</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold" id="model-group-count">-</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>API Keys</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold" id="key-count">-</p></CardContent>
        </Card>
      </div>
    </div>
  )
}
