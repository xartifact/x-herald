"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Plus, Pencil, Trash2, Search } from "lucide-react"

import { useModels, useCreateModel, useUpdateModel, useDeleteModel } from "@/hooks/use-models"
import { useProviders } from "@/hooks/use-providers"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"

// 路由策略选项
const ROUTING_STRATEGIES = [
  { value: "round_robin", label: "轮询" },
  { value: "weighted", label: "加权" },
 { value: "least_latency", label: "最低延迟" },
  { value: "priority", label: "优先级" },
  { value: "smart", label: "智能路由" },
] as const

// 协议选项
const PROTOCOL_OPTIONS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Gemini" },
] as const

// 表单验证 schema
const modelSchema = z.object({
  name: z.string().min(2, "模型名称至少需要 2 个字符"),
  displayName: z.string().min(2, "显示名称至少需要 2 个字符"),
  actualModelName: z.string().min(1, "实际模型名称不能为空"),
  providerId: z.string().min(1, "请选择供应商"),
  enabled: z.boolean(),
  routingStrategy: z.enum(["round_robin", "weighted", "least_latency", "priority", "smart"]),
  fallbackEnabled: z.boolean(),
  protocolConversionEnabled: z.boolean(),
  targetProtocol: z.enum(["openai", "anthropic", "gemini"]),
})

type ModelFormData = z.infer<typeof modelSchema>

export default function ModelsPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingModelId, setEditingModelId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  // 使用 TanStack Query Hooks
  const { data: models = [], isLoading: loading } = useModels()
  const { data: providers = [] } = useProviders()
  const createModel = useCreateModel()
  const updateModel = useUpdateModel()
  const deleteModel = useDeleteModel()

  const form = useForm<ModelFormData>({
    resolver: zodResolver(modelSchema),
    defaultValues: {
      name: "",
      displayName: "",
      actualModelName: "",
      providerId: "",
      enabled: true,
      routingStrategy: "round_robin",
      fallbackEnabled: true,
      protocolConversionEnabled: false,
      targetProtocol: "openai",
    },
  })

  // 获取当前编辑的模型
  const editingModel = editingModelId
    ? models.find(m => m.id === editingModelId)
    : null

  const onSubmit = async (data: ModelFormData) => {
    const payload = {
      name: data.name,
      displayName: data.displayName,
      actualModelName: data.actualModelName,
      providerId: data.providerId,
      enabled: data.enabled,
      routingConfig: {
        strategy: data.routingStrategy,
        fallbackEnabled: data.fallbackEnabled,
      },
      protocolConversion: {
        enabled: data.protocolConversionEnabled,
        targetProtocol: data.targetProtocol,
      },
    }

    if (editingModelId) {
      await updateModel.mutateAsync({
        id: editingModelId,
        data: payload,
      })
    } else {
      await createModel.mutateAsync(payload)
    }

    setDialogOpen(false)
    setEditingModelId(null)
    form.reset()
  }

  const handleEdit = (modelId: string) => {
    const model = models.find(m => m.id === modelId)
    if (!model) return

    setEditingModelId(modelId)
    form.reset({
      name: model.name,
      displayName: model.displayName,
      actualModelName: model.actualModelName,
      providerId: model.providerId,
      enabled: model.enabled,
      routingStrategy: model.routingConfig.strategy,
      fallbackEnabled: model.routingConfig.fallbackEnabled,
      protocolConversionEnabled: model.protocolConversion.enabled,
      targetProtocol: model.protocolConversion.targetProtocol,
    })
    setDialogOpen(true)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除模型 "${name}" 吗？\n\n此操作不可撤销。`)) {
      return
    }

    await deleteModel.mutateAsync(id)
  }

  const handleAddNew = () => {
    setEditingModelId(null)
    form.reset({
      name: "",
      displayName: "",
      actualModelName: "",
      providerId: "",
      enabled: true,
      routingStrategy: "round_robin",
      fallbackEnabled: true,
      protocolConversionEnabled: false,
      targetProtocol: "openai",
    })
    setDialogOpen(true)
  }

  const getProviderName = (providerId: string) => {
    const provider = providers.find((p) => p.id === providerId)
    return provider?.name || "未知供应商"
  }

  const filteredModels = models.filter((model) =>
    model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    model.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* 页面标题和操作栏 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">模型管理</h2>
          <p className="text-muted-foreground">
            管理所有 LLM 模型配置
          </p>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="mr-2 h-4 w-4" />
          添加模型
        </Button>
      </div>

      {/* 搜索栏 */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索模型..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {/* 模型列表 */}
      {loading ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              加载中...
            </div>
          </CardContent>
        </Card>
      ) : filteredModels.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                {searchQuery ? "没有找到匹配的模型" : "还没有模型"}
              </p>
              {!searchQuery && (
                <Button onClick={handleAddNew} variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  添加第一个模型
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
                  <TableHead>模型信息</TableHead>
                  <TableHead>供应商</TableHead>
                  <TableHead>路由策略</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredModels.map((model) => (
                  <TableRow key={model.id}>
                    <TableCell>
                      <div className="font-medium">{model.displayName}</div>
                      <div className="text-sm text-muted-foreground">{model.name}</div>
                      <div className="text-xs text-muted-foreground">
                        实际: {model.actualModelName}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{getProviderName(model.providerId)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {ROUTING_STRATEGIES.find(s => s.value === model.routingConfig.strategy)?.label || model.routingConfig.strategy}
                      </div>
                      {model.routingConfig.fallbackEnabled && (
                        <Badge variant="outline" className="text-xs mt-1">
                          故障转移
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={model.enabled ? "default" : "destructive"}>
                        {model.enabled ? "启用" : "禁用"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {new Date(model.createdAt).toLocaleDateString("zh-CN")}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(model.id)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(model.id, model.displayName)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 添加/编辑对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingModelId ? "编辑模型" : "添加模型"}
            </DialogTitle>
            <DialogDescription>
              {editingModelId
                ? "修改模型配置信息"
                : "配置新的 LLM 模型"}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* 基本信息 */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium">基本信息</h4>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>模型名称 *</FormLabel>
                        <FormControl>
                          <Input placeholder="gpt-4" {...field} />
                        </FormControl>
                        <FormDescription>
                          用于 API 调用的唯一标识
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="displayName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>显示名称 *</FormLabel>
                        <FormControl>
                          <Input placeholder="GPT-4" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="actualModelName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>实际模型名称 *</FormLabel>
                        <FormControl>
                          <Input placeholder="gpt-4-turbo-preview" {...field} />
                        </FormControl>
                        <FormDescription>
                          供应商的实际模型名称
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="providerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>供应商 *</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="选择供应商" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {providers.map((provider) => (
                              <SelectItem key={provider.id} value={provider.id}>
                                {provider.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="enabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>启用模型</FormLabel>
                        <FormDescription>
                          禁用后此模型将不会被路由使用
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              {/* 路由配置 */}
              <div className="space-y-4 pt-4 border-t">
                <h4 className="text-sm font-medium">路由配置</h4>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="routingStrategy"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>路由策略</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {ROUTING_STRATEGIES.map((strategy) => (
                              <SelectItem key={strategy.value} value={strategy.value}>
                                {strategy.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="fallbackEnabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 pt-6">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>启用故障转移</FormLabel>
                          <FormDescription>
                            主模型不可用时自动切换
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* 协议转换 */}
              <div className="space-y-4 pt-4 border-t">
                <h4 className="text-sm font-medium">协议转换</h4>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="protocolConversionEnabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>启用协议转换</FormLabel>
                          <FormDescription>
                            自动转换请求协议格式
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />

                  {form.watch("protocolConversionEnabled") && (
                    <FormField
                      control={form.control}
                      name="targetProtocol"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>目标协议</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {PROTOCOL_OPTIONS.map((protocol) => (
                                <SelectItem key={protocol.value} value={protocol.value}>
                                  {protocol.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  取消
                </Button>
                <Button type="submit" disabled={createModel.isPending || updateModel.isPending}>
                  {createModel.isPending || updateModel.isPending
                    ? "保存中..."
                    : editingModelId ? "保存更改" : "创建"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
