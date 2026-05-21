import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@x-llm-gateway/ui'

export const Route = createFileRoute('/admin/client-models/')({
  component: ClientModelsPage,
})

function ClientModelsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">client-models</h1>
      <Card>
        <CardHeader><CardTitle>client-models</CardTitle></CardHeader>
        <CardContent>敬请期待</CardContent>
      </Card>
    </div>
  )
}
