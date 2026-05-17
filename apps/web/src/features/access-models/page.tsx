'use client'

import { Plus, Search } from 'lucide-react'

import { Button } from '@/ui/button'
import { Card, CardContent } from '@/ui/card'
import { Input } from '@/ui/input'

import { AccessModelFormDialog } from './components/access-model-form-dialog'
import { AccessModelTable } from './components/AccessModelTable'
import { CATCHALL_VM_NAME } from './constants'
import { useAccessModelPage } from './useAccessModelPage'

export default function AccessModelsPage() {
  const {
    searchQuery, setSearchQuery, dialogOpen, setDialogOpen, editingId,
    isLoading, filteredModels, form, submitPending, handleAdd, handleEdit, handleDelete, handleToggle, onSubmit,
  } = useAccessModelPage()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">接入模型</h2>
          <p className="text-muted-foreground">管理对外暴露的接入模型名称，通过规则引擎路由到具体模型组或实例</p>
        </div>
        <Button onClick={handleAdd}><Plus className="mr-2 h-4 w-4" />创建接入模型</Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="搜索接入模型..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8" />
        </div>
      </div>

      {isLoading ? (
        <Card><CardContent className="py-12"><div className="text-center text-muted-foreground">加载中...</div></CardContent></Card>
      ) : filteredModels.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">{searchQuery ? '没有找到匹配的接入模型' : '还没有接入模型'}</p>
              {!searchQuery && <Button onClick={handleAdd} variant="outline"><Plus className="mr-2 h-4 w-4" />创建第一个接入模型</Button>}
            </div>
          </CardContent>
        </Card>
      ) : (
        <AccessModelTable models={filteredModels} onEdit={handleEdit} onDelete={handleDelete} onToggle={handleToggle} />
      )}

      <AccessModelFormDialog open={dialogOpen} onOpenChange={setDialogOpen} form={form} editingId={editingId} isPending={submitPending} onSubmit={onSubmit} />
    </div>
  )
}
