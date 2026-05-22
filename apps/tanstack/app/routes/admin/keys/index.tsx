import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Badge, Button, Input, Label, Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@x-llm-gateway/ui'
import { Key, Plus, Trash2 } from 'lucide-react'

export const Route = createFileRoute('/admin/keys/')({ component: KeysPage })

function KeysPage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [newKey, setNewKey] = useState('')

  const { data, isLoading } = useQuery({ queryKey: ['keys'], queryFn: () => fetch('/api/keys').then(r => r.json()) })

  const createMutation = useMutation({
    mutationFn: () => fetch('/api/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }).then(r => r.json()),
    onSuccess: (res) => { setNewKey(res.data?.key || ''); qc.invalidateQueries({ queryKey: ['keys'] }) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['keys'] }),
  })

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">API Keys 管理</h1>
        <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) { setName(''); setNewKey('') } }}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> 添加 Key</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>添加 API Key</DialogTitle></DialogHeader>
            {newKey ? (
              <div className="py-4">
                <Label>新创建的 Key（请立即保存，不会再次显示）</Label>
                <Input value={newKey} readOnly className="font-mono mt-2" />
                <Button className="mt-4 w-full" onClick={() => { navigator.clipboard?.writeText(newKey); setOpen(false) }}>复制并关闭</Button>
              </div>
            ) : (
              <div className="grid gap-4 py-4">
                <div><Label>名称</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Key 名称" /></div>
                <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !name}>创建</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? <p>加载中...</p> : (
        <div className="grid gap-4">
          {data?.data?.map((k: any) => (
            <Card key={k.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3"><Key className="h-5 w-5" /><CardTitle>{k.name}</CardTitle><Badge variant={k.enabled ? 'default' : 'secondary'}>{k.enabled ? '启用' : '禁用'}</Badge></div>
                  <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(k.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
