import { useCallback, useMemo, useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Sparkles } from 'lucide-react'

import {
  Card,
  CardContent,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  PotentialModelList,
  ConvertDialog,
  type ConvertFormValues,
  RouteToDialog,
  type RouteToFormValues,
  ListPagination,
  PageHeader,
  EmptyState,
} from '@xartifact/x-herald-ui'

import {
  usePotentialModels,
  useUpdatePotentialModel,
  useDeletePotentialModel,
  useConvertPotentialModel,
  useAccessModelsForTarget,
} from '../../../hooks/potential-models'

import type {
  ListPotentialModelsQuery,
  PotentialModel,
  PotentialModelAction,
} from '@xartifact/x-herald-shared'

const PAGE_SIZE_OPTIONS = [20, 50, 100]

const ACTION_FILTER_OPTIONS: Array<{ value: 'all' | PotentialModelAction; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'observe', label: '观察' },
  { value: 'route_to_access_model', label: '路由至接入模型' },
]

const ENABLED_FILTER_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'true', label: '启用' },
  { value: 'false', label: '禁用' },
] as const

const convertSchema = z.object({
  displayName: z.string().optional(),
  description: z.string().optional(),
  enabled: z.boolean(),
  deleteAfterConvert: z.boolean(),
})
type ConvertFormSchema = z.infer<typeof convertSchema>

const routeToSchema = z.object({
  targetAccessModelId: z.string().min(1, '请选择目标接入模型'),
  note: z.string().optional(),
})
type RouteToFormSchema = z.infer<typeof routeToSchema>

export function PotentialModelsPage() {
  const [actionFilter, setActionFilter] = useState<'all' | PotentialModelAction>('all')
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'true' | 'false'>('all')
  const [minCount, setMinCount] = useState<number>(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [convertPm, setConvertPm] = useState<PotentialModel | null>(null)
  const [convertOpen, setConvertOpen] = useState(false)
  const [routeToPm, setRouteToPm] = useState<PotentialModel | null>(null)
  const [routeToOpen, setRouteToOpen] = useState(false)

  const queryParams = useMemo<Partial<ListPotentialModelsQuery>>(() => {
    const params: Partial<ListPotentialModelsQuery> = { minCount, page: currentPage, pageSize }
    if (actionFilter !== 'all') params.action = actionFilter
    if (enabledFilter !== 'all') params.enabled = enabledFilter === 'true'
    return params
  }, [actionFilter, enabledFilter, minCount, currentPage, pageSize])

  const { data: modelsResult, isLoading } = usePotentialModels(queryParams)
  const models = modelsResult?.data ?? []
  const pagination = modelsResult?.pagination
  const { enabledModels: enabledAccessModels = [] } = useAccessModelsForTarget()
  const updateMutation = useUpdatePotentialModel()
  const deleteMutation = useDeletePotentialModel()
  const convertMutation = useConvertPotentialModel()

  useEffect(() => {
    setCurrentPage(1)
  }, [actionFilter, enabledFilter, minCount])

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size)
    setCurrentPage(1)
  }, [])

  const accessModelsById = useMemo(
    () => new Map(enabledAccessModels.map((am) => [am.id, am])),
    [enabledAccessModels],
  )

  const convertForm = useForm<ConvertFormSchema>({
    resolver: zodResolver(convertSchema),
    defaultValues: {
      displayName: '',
      description: '',
      enabled: true,
      deleteAfterConvert: true,
    },
  })

  const routeToForm = useForm<RouteToFormSchema>({
    resolver: zodResolver(routeToSchema),
    defaultValues: { targetAccessModelId: '', note: '' },
  })

  const handleConvertOpen = useCallback((pm: PotentialModel) => {
    setConvertPm(pm)
    setConvertOpen(true)
  }, [])

  const handleRouteToOpen = useCallback((pm: PotentialModel) => {
    setRouteToPm(pm)
    setRouteToOpen(true)
  }, [])

  const handleToggleEnabled = useCallback(
    (pm: PotentialModel) => {
      updateMutation.mutate({ id: pm.id, data: { enabled: !pm.enabled } })
    },
    [updateMutation],
  )

  const handleDelete = useCallback(
    (pm: PotentialModel) => {
      deleteMutation.mutate(pm.id)
    },
    [deleteMutation],
  )

  const handleConvertSubmit = useCallback(
    (values: ConvertFormValues) => {
      if (!convertPm) return
      convertMutation.mutate(
        {
          id: convertPm.id,
          data: {
            displayName: values.displayName || undefined,
            description: values.description || undefined,
            enabled: values.enabled,
            deleteAfterConvert: values.deleteAfterConvert,
          },
        },
        { onSuccess: () => setConvertOpen(false) },
      )
    },
    [convertPm, convertMutation],
  )

  const handleRouteToSubmit = useCallback(
    (values: RouteToFormValues) => {
      if (!routeToPm) return
      updateMutation.mutate(
        {
          id: routeToPm.id,
          data: {
            action: 'route_to_access_model',
            targetAccessModelId: values.targetAccessModelId,
            note: values.note || null,
          },
        },
        { onSuccess: () => setRouteToOpen(false) },
      )
    },
    [routeToPm, updateMutation],
  )

  const showEmptyState = !isLoading && models.length === 0

  return (
    <div className="space-y-6">
      <PageHeader title="潜在模型" icon={<Sparkles className="h-5 w-5 text-primary" />} />

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="potential-filter-action" className="text-xs text-muted-foreground">
                策略
              </Label>
              <Select
                value={actionFilter}
                onValueChange={(v) => setActionFilter(v as typeof actionFilter)}
              >
                <SelectTrigger id="potential-filter-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_FILTER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="potential-filter-enabled" className="text-xs text-muted-foreground">
                状态
              </Label>
              <Select
                value={enabledFilter}
                onValueChange={(v) => setEnabledFilter(v as typeof enabledFilter)}
              >
                <SelectTrigger id="potential-filter-enabled">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENABLED_FILTER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="potential-filter-min-count" className="text-xs text-muted-foreground">
                最小请求数
              </Label>
              <Input
                id="potential-filter-min-count"
                type="number"
                min={0}
                value={minCount}
                onChange={(e) => setMinCount(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {showEmptyState ? (
        <EmptyState />
      ) : (
        <PotentialModelList
          models={models}
          accessModelsById={accessModelsById}
          isLoading={isLoading}
          onConvert={handleConvertOpen}
          onRouteTo={handleRouteToOpen}
          onToggleEnabled={handleToggleEnabled}
          onDelete={handleDelete}
        />
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex justify-center">
          <ListPagination
            currentPage={currentPage}
            totalPages={pagination.totalPages}
            pageSize={pageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageChange={setCurrentPage}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>
      )}

      <ConvertDialog
        open={convertOpen}
        onOpenChange={(open) => {
          setConvertOpen(open)
          if (!open) setConvertPm(null)
        }}
        pm={convertPm}
        form={convertForm}
        isPending={convertMutation.isPending}
        onSubmit={handleConvertSubmit}
      />

      <RouteToDialog
        open={routeToOpen}
        onOpenChange={(open) => {
          setRouteToOpen(open)
          if (!open) setRouteToPm(null)
        }}
        pm={routeToPm}
        accessModels={enabledAccessModels}
        form={routeToForm}
        isPending={updateMutation.isPending}
        onSubmit={handleRouteToSubmit}
      />
    </div>
  )
}
