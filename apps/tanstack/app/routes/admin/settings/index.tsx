import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@x-llm-gateway/ui'

export const Route = createFileRoute('/admin/settings/')({
  component: SettingsPage,
})

function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">settings</h1>
      <Card>
        <CardHeader><CardTitle>settings</CardTitle></CardHeader>
        <CardContent>敬请期待</CardContent>
      </Card>
    </div>
  )
}
