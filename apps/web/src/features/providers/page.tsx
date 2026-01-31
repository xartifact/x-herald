'use client'

import { Plus, Search } from 'lucide-react'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Card, CardContent } from '@/ui/card'
import { ProviderTable, ProviderFormDialog } from './components'
import { useProviderPage } from './useProviderPage'

export default function ProvidersPage() {
  const {
    loading,
    filteredProviders,
    dialogOpen,
    setDialogOpen,
    editingProviderId,
    searchQuery,
    setSearchQuery,
    showApiKey,
    showFormApiKey,
    setShowFormApiKey,
    isSubmitting,
    form,
    PROTOCOL_OPTIONS,
    onSubmit,
    handleEdit,
    handleDelete,
    handleAddNew,
    toggleShowApiKey,
  } = useProviderPage()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">供应商管理</h2>
          <p className="text-muted-foreground">管理所有 LLM 供应商配置</p>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="mr-2 h-4 w-4" />
          添加供应商
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索供应商..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">加载中...</div>
          </CardContent>
        </Card>
      ) : filteredProviders.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                {searchQuery ? '没有找到匹配的供应商' : '还没有供应商'}
              </p>
              {!searchQuery && (
                <Button onClick={handleAddNew} variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  添加第一个供应商
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <ProviderTable
          providers={filteredProviders}
          showApiKey={showApiKey}
          onToggleShowApiKey={toggleShowApiKey}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

      <ProviderFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        editingId={editingProviderId}
        isPending={isSubmitting}
        showApiKey={showFormApiKey}
        onToggleShowApiKey={() => setShowFormApiKey(!showFormApiKey)}
        onSubmit={onSubmit}
        protocolOptions={PROTOCOL_OPTIONS}
      />
    </div>
  )
}
