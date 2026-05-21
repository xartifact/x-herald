import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@x-llm-gateway/ui'

export const Route = createFileRoute('/admin/logs/')({
  component: LogsPage,
})

function LogsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">logs</h1>
      <Card>
        <CardHeader><CardTitle>logs</CardTitle></CardHeader>
        <CardContent>敬请期待</CardContent>
      </Card>
    </div>
  )
}
