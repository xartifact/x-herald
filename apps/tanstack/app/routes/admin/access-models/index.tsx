import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@x-llm-gateway/ui'

export const Route = createFileRoute('/admin/access-models/')({
  component: AccessModelsPage,
})

function AccessModelsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">access-models</h1>
      <Card>
        <CardHeader><CardTitle>access-models</CardTitle></CardHeader>
        <CardContent>敬请期待</CardContent>
      </Card>
    </div>
  )
}
