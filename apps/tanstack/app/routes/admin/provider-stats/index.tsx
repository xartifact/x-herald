import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@x-llm-gateway/ui'

export const Route = createFileRoute('/admin/provider-stats/')({
  component: ProviderStatsPage,
})

function ProviderStatsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">provider-stats</h1>
      <Card>
        <CardHeader><CardTitle>provider-stats</CardTitle></CardHeader>
        <CardContent>敬请期待</CardContent>
      </Card>
    </div>
  )
}
