'use client'

import { useState } from 'react'
import { Plus, Search, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { Badge } from '@/ui/badge'
import { Switch } from '@/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/ui/table'
import { useModelGroups } from '@/features/model-groups/useModelGroups'
import { useVirtualModel } from './useVirtualModels'
import { useVirtualModelPage } from './useVirtualModelPage'
import { VirtualModelFormDialog } from './components/virtual-model-form-dialog'
import { MappingList } from './components/mapping-list'
import { MappingAddDialog } from './components/mapping-add-dialog'
import type { VirtualModel } from './types'

function VirtualModelRow({
  vm,
  onEdit,
  onDelete,
  onToggle,
}: {
  vm: VirtualModel
  onEdit: (vm: VirtualModel) => void
  onDelete: (vm: VirtualModel) => void
  onToggle: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { data: detail } = useVirtualModel(expanded ? vm.id : null)

  return (
    <>
      <TableRow>
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            className="p-0 h-6 w-6"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </TableCell>
        <TableCell>
          <div>
            <code className="font-medium">{vm.name}</code>
            {vm.displayName && (
              <div className="text-xs text-muted-foreground">{vm.displayName}</div>
            )}
          </div>
        </TableCell>
        <TableCell>
          {vm.modelGroup ? (
            <Badge variant="outline">
              {vm.modelGroup.displayName || vm.modelGroup.name}
            </Badge>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </TableCell>
        <TableCell>
          <Badge variant="secondary">
            {vm.mappingCount ?? 0}
          </Badge>
        </TableCell>
        <TableCell>
          {vm.routingConfig?.strategy ? (
            <Badge variant="outline">{vm.routingConfig.strategy}</Badge>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </TableCell>
        <TableCell>
          <span className="text-sm text-muted-foreground">
            {vm.description || '-'}
          </span>
        </TableCell>
        <TableCell>
          <Switch
            checked={vm.enabled}
            onCheckedChange={() => onToggle(vm.id)}
          />
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onEdit(vm)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(vm)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={8} className="bg-muted/30 p-4">
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">映射配置</CardTitle>
                  <MappingAddDialog virtualModelId={vm.id} />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <MappingList
                  virtualModelId={vm.id}
                  mappings={detail?.mappings || []}
                />
              </CardContent>
            </Card>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

export default function VirtualModelsPage() {
  const {
    searchQuery,
    setSearchQuery,
    dialogOpen,
    setDialogOpen,
    editingId,
    isLoading,
    filteredModels,
    form,
    submitPending,
    handleAdd,
    handleEdit,
    handleDelete,
    handleToggle,
    onSubmit,
  } = useVirtualModelPage()

  const { data: groups = [] } = useModelGroups()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">虚拟模型</h2>
          <p className="text-muted-foreground">
            管理对外暴露的虚拟模型名称，支持多目标映射和路由策略
          </p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="mr-2 h-4 w-4" />
          创建虚拟模型
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索虚拟模型..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">加载中...</div>
          </CardContent>
        </Card>
      ) : filteredModels.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                {searchQuery ? '没有找到匹配的虚拟模型' : '还没有虚拟模型'}
              </p>
              {!searchQuery && (
                <Button onClick={handleAdd} variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  创建第一个虚拟模型
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>虚拟模型名</TableHead>
                  <TableHead>默认模型组</TableHead>
                  <TableHead>映射数</TableHead>
                  <TableHead>路由策略</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredModels.map((vm) => (
                  <VirtualModelRow
                    key={vm.id}
                    vm={vm}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onToggle={handleToggle}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <VirtualModelFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        editingId={editingId}
        isPending={submitPending}
        groups={groups}
        onSubmit={onSubmit}
      />
    </div>
  )
}
