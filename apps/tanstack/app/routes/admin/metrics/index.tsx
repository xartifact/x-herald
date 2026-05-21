import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@x-llm-gateway/ui'

export const Route = createFileRoute('/admin/metrics/')({
  component: MetricsPage,
})

function MetricsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">metrics</h1>
      <Card>
        <CardHeader><CardTitle>metrics</CardTitle></CardHeader>
        <CardContent>敬请期待</CardContent>
      </Card>
    </div>
  )
}
