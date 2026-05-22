import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  Card, CardContent, CardHeader, CardTitle,
  Badge, Button, Input, Label, Switch, Dialog, DialogContent,
  DialogHeader, DialogTitle, DialogTrigger,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@x-llm-gateway/ui'
import { Plus, Server, Pencil, Trash2 } from 'lucide-react'

export const Route = createFileRoute('/admin/providers/')({ component: ProvidersPage })

function ProvidersPage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', baseUrl: '', apiKey: '', protocol: 'openai' })

  const { data, isLoading } = useQuery({
    queryKey: ['providers'],
    queryFn: () => fetch('/api/providers').then(r => r.json()),
  })

  const saveMutation = useMutation({
    mutationFn: () => {
      const url = editId ? `/api/providers/${editId}` : '/api/providers'
      return fetch(url, {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      }).then(r => r.json())
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['providers'] }); setOpen(false); setEditId(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/providers/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] }),
  })

  const openEdit = (p: any) => {
    setForm({ name: p.name, baseUrl: p.baseUrl, apiKey: '', protocol: p.protocol })
    setEditId(p.id); setOpen(true)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">提供商管理</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditId(null); setForm({ name: '', baseUrl: '', apiKey: '', protocol: 'openai' }) }}>
              <Plus className="mr-2 h-4 w-4" /> 添加提供商
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? '编辑' : '添加'}提供商</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div><Label>名称</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>地址</Label><Input value={form.baseUrl} onChange={e => setForm({ ...form, baseUrl: e.target.value })} /></div>
              <div><Label>API Key</Label><Input type="password" value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} /></div>
              <div>
                <Label>协议</Label>
                <Select value={form.protocol} onValueChange={v => setForm({ ...form, protocol: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                    <SelectItem value="gemini">Gemini</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? '保存中...' : '保存'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <p>加载中...</p> : (
        <div className="grid gap-4">
          {data?.data?.map((p: any) => (
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Server className="h-5 w-5" />
                    <CardTitle>{p.name}</CardTitle>
                    <Badge variant={p.enabled ? 'default' : 'secondary'}>{p.enabled ? '启用' : '禁用'}</Badge>
                    <Badge variant="outline">{p.protocol}</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(p.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{p.baseUrl}</p>
                <p className="text-sm">模型数: {p.models?.length || 0}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
