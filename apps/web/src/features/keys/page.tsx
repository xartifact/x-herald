'use client'

import { Plus, Search } from 'lucide-react'

import { Button } from '@x-llm-gateway/ui'
import { Card, CardContent } from '@x-llm-gateway/ui'
import { Input } from '@x-llm-gateway/ui'

import { KeyTable, KeyFormDialog, KeyResetDialog } from './components'
import { KeyStatsSheet } from './components/key-stats-sheet'
import { useKeyPage } from './useKeyPage'

export default function KeysPage() {
  const {
    loading,
    filteredKeys,
    dialogOpen,
    setDialogOpen,
    editingKeyId,
    searchQuery,
    setSearchQuery,
    showKeyValue,
    copiedKey,
    showNewKey,
    newlyCreatedKey,
    resetDialogOpen,
    setResetDialogOpen,
    resetKeyValue,
    isSubmitting,
    isResetting,
    form,
    onSubmit,
    handleEdit,
    handleDelete,
    handleAddNew,
    handleReset,
    confirmReset,
    copyToClipboard,
    toggleShowKey,
    closeDialog,
    closeResetDialog,
    formatDate,
    statsKeyId,
    setStatsKeyId,
    statsKey,
    statsPeriod,
    setStatsPeriod,
    statsMap,
    handleShowStats,
  } = useKeyPage()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">密钥管理</h2>
          <p className="text-muted-foreground">管理用于访问 LLM Gateway 的虚拟密钥</p>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="mr-2 h-4 w-4" />
          创建密钥
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索密钥..."
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
      ) : filteredKeys.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                {searchQuery ? '没有找到匹配的密钥' : '还没有密钥'}
              </p>
              {!searchQuery && (
                <Button onClick={handleAddNew} variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  创建第一个密钥
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <KeyTable
          keys={filteredKeys}
          display={{ showKeyValue, copiedKey, onToggleShow: toggleShowKey, onCopy: copyToClipboard }}
          actions={{ onEdit: handleEdit, onDelete: handleDelete, onReset: handleReset, onShowStats: handleShowStats }}
          stats={statsMap}
          formatDate={formatDate}
        />
      )}

      <KeyFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        editingId={editingKeyId}
        isPending={isSubmitting}
        showNewKey={showNewKey}
        newlyCreatedKey={newlyCreatedKey}
        copiedKey={copiedKey}
        onSubmit={onSubmit}
        onCopyNewKey={() => newlyCreatedKey && copyToClipboard(newlyCreatedKey, 'new')}
      />

      <KeyResetDialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        resetKeyValue={resetKeyValue}
        copied={copiedKey === 'reset'}
        isPending={isResetting}
        onConfirm={confirmReset}
        onCopy={() => resetKeyValue && copyToClipboard(resetKeyValue, 'reset')}
        onCancel={closeResetDialog}
      />

      <KeyStatsSheet
        open={statsKeyId !== null}
        onOpenChange={(open) => { if (!open) setStatsKeyId(null) }}
        virtualKey={statsKey}
        stat={statsKeyId ? statsMap.get(statsKeyId) : undefined}
        period={statsPeriod}
        onPeriodChange={setStatsPeriod}
      />
    </div>
  )
}
