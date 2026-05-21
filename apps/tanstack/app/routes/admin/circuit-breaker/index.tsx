import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@x-llm-gateway/ui'

export const Route = createFileRoute('/admin/circuit-breaker/')({
  component: CircuitBreakerPage,
})

function CircuitBreakerPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">circuit-breaker</h1>
      <Card>
        <CardHeader><CardTitle>circuit-breaker</CardTitle></CardHeader>
        <CardContent>敬请期待</CardContent>
      </Card>
    </div>
  )
}
