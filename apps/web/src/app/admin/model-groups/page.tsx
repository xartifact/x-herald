'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Search, Layers, Server, Settings, ChevronDown, ChevronUp } from 'lucide-react'
import {
  useModelGroups,
  useCreateModelGroup,
  useUpdateModelGroup,
  useDeleteModelGroup,
  useToggleModelGroup,
  useCreateModelInstance,
  useUpdateModelInstance,
  useDeleteModelInstance,
  useToggleModelInstance,
  type ModelGroup,
  type ModelInstance,
} from '@/hooks/use-model-groups'
import { useProviders } from '@/hooks/use-providers'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useForm } from 'react-hook-form'

// 路由策略选项
const ROUTING_STRATEGIES = [
  { value: 'round_robin', label: '轮询' },
  { value: 'weighted', label: '加权' },
  { value: 'least_latency', label: '最低延迟' },
  { value: 'priority', label: '优先级' },
  { value: 'cost_optimized', label: '成本优化' },
  { value: 'smart', label: '智能路由' },
] as const

// 类型定义
interface GroupFormData {
  name: string
  displayName: string
  description: string
  category: 'chat' | 'embedding' | 'image' | 'audio'
  capabilities: {
    streaming: boolean
    functionCalling: boolean
    vision: boolean
    jsonMode: boolean
    maxTokens: number
    contextWindow: number
  }
  routingStrategy: 'round_robin' | 'weighted' | 'least_latency' | 'priority' | 'cost_optimized' | 'smart'
  fallbackEnabled: boolean
}

interface InstanceFormData {
  groupId: string
  providerId: string
  name: string
  actualModelName: string
  description: string
  weight: number
  priority: number
}

export default function ModelGroupsPage() {
  const [activeTab, setActiveTab] = useState('groups')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)

  // 对话框状态
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [instanceDialogOpen, setInstanceDialogOpen] = useState(false)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null)

  // 数据查询
  const { data: groups = [], isLoading: groupsLoading } = useModelGroups()
  const { data: providers = [] } = useProviders()

  // Mutations
  const createGroup = useCreateModelGroup()
  const updateGroup = useUpdateModelGroup()
  const deleteGroup = useDeleteModelGroup()
  const toggleGroup = useToggleModelGroup()

  const createInstance = useCreateModelInstance()
  const updateInstance = useUpdateModelInstance()
  const deleteInstance = useDeleteModelInstance()
  const toggleInstance = useToggleModelInstance()

  // 表单
  const groupForm = useForm<GroupFormData>({
    defaultValues: {
      name: '',
      displayName: '',
      description: '',
      category: 'chat',
      capabilities: {
        streaming: true,
        functionCalling: false,
        vision: false,
        jsonMode: false,
        maxTokens: 4096,
        contextWindow: 8192,
      },
      routingStrategy: 'smart',
      fallbackEnabled: true,
    },
  })

  const instanceForm = useForm<InstanceFormData>({
    defaultValues: {
      groupId: '',
      providerId: '',
      name: '',
      actualModelName: '',
      description: '',
      weight: 100,
      priority: 0,
    },
  })

  // 提交模型组表单
  const onGroupSubmit = async (data: GroupFormData) => {
    const payload = {
      name: data.name,
      displayName: data.displayName,
      description: data.description,
      category: data.category,
      capabilities: data.capabilities,
      routingConfig: {
        strategy: data.routingStrategy,
        fallbackEnabled: data.fallbackEnabled,
      },
    }

    if (editingGroupId) {
      await updateGroup.mutateAsync({ id: editingGroupId, data: payload })
    } else {
      await createGroup.mutateAsync(payload)
    }

    setGroupDialogOpen(false)
    setEditingGroupId(null)
    groupForm.reset()
  }

  // 提交实例表单
  const onInstanceSubmit = async (data: InstanceFormData) => {
    const payload = {
      groupId: data.groupId,
      providerId: data.providerId,
      name: data.name,
      actualModelName: data.actualModelName,
      description: data.description,
      weight: data.weight,
      priority: data.priority,
    }

    if (editingInstanceId) {
      await updateInstance.mutateAsync({
        id: editingInstanceId,
        groupId: data.groupId,
        data: payload,
      })
    } else {
      await createInstance.mutateAsync(payload)
    }

    setInstanceDialogOpen(false)
    setEditingInstanceId(null)
    instanceForm.reset()
  }

  // 编辑模型组
  const handleEditGroup = (group: ModelGroup) => {
    setEditingGroupId(group.id)
    groupForm.reset({
      name: group.name,
      displayName: group.displayName,
      description: group.description || '',
      category: group.category as 'chat' | 'embedding' | 'image' | 'audio',
      capabilities: group.capabilities,
      routingStrategy: group.routingConfig.strategy,
      fallbackEnabled: group.routingConfig.fallbackEnabled,
    })
    setGroupDialogOpen(true)
  }

  // 添加新模型组
  const handleAddGroup = () => {
    setEditingGroupId(null)
    groupForm.reset({
      name: '',
      displayName: '',
      description: '',
      category: 'chat',
      capabilities: {
        streaming: true,
        functionCalling: false,
        vision: false,
        jsonMode: false,
        maxTokens: 4096,
        contextWindow: 8192,
      },
      routingStrategy: 'smart',
      fallbackEnabled: true,
    })
    setGroupDialogOpen(true)
  }

  // 添加新实例
  const handleAddInstance = (groupId?: string) => {
    setEditingInstanceId(null)
    instanceForm.reset({
      groupId: groupId || '',
      providerId: '',
      name: '',
      actualModelName: '',
      description: '',
      weight: 100,
      priority: 0,
    })
    setInstanceDialogOpen(true)
  }

  // 编辑实例
  const handleEditInstance = (instance: ModelInstance) => {
    setEditingInstanceId(instance.id)
    instanceForm.reset({
      groupId: instance.groupId,
      providerId: instance.providerId,
      name: instance.name,
      actualModelName: instance.actualModelName,
      description: instance.description || '',
      weight: instance.weight,
      priority: instance.priority,
    })
    setInstanceDialogOpen(true)
  }

  // 删除模型组
  const handleDeleteGroup = async (id: string, name: string) => {
    if (!confirm(`确定要删除模型组 "${name}" 吗？\n\n此操作不可撤销。`)) {
      return
    }
    await deleteGroup.mutateAsync(id)
  }

  // 删除实例
  const handleDeleteInstance = async (id: string, groupId: string, name: string) => {
    if (!confirm(`确定要删除模型实例 "${name}" 吗？`)) {
      return
    }
    await deleteInstance.mutateAsync({ id, groupId })
  }

  // 获取实例对应的供应商名称
  const getProviderName = (providerId: string) => {
    return providers.find((p) => p.id === providerId)?.name || '未知供应商'
  }

  // 过滤模型组
  const filteredGroups = groups.filter(
    (group) =>
      group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      group.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">模型组管理</h2>
          <p className="text-muted-foreground">管理模型组和模型实例配置</p>
        </div>
      </div>

      {/* 标签页 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="groups">
            <Layers className="mr-2 h-4 w-4" />
            模型组
          </TabsTrigger>
          <TabsTrigger value="instances">
            <Server className="mr-2 h-4 w-4" />
            模型实例
          </TabsTrigger>
        </TabsList>

        {/* 模型组标签页 */}
        <TabsContent value="groups" className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索模型组..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button onClick={handleAddGroup}>
              <Plus className="mr-2 h-4 w-4" />
              添加模型组
            </Button>
          </div>

          {groupsLoading ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">加载中...</div>
              </CardContent>
            </Card>
          ) : filteredGroups.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center space-y-4">
                  <p className="text-muted-foreground">
                    {searchQuery ? '没有找到匹配的模型组' : '还没有模型组'}
                  </p>
                  {!searchQuery && (
                    <Button onClick={handleAddGroup} variant="outline">
                      <Plus className="mr-2 h-4 w-4" />
                      添加第一个模型组
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredGroups.map((group) => (
                <Card key={group.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Layers className="h-5 w-5 text-primary" />
                        <div>
                          <CardTitle className="text-lg">{group.displayName}</CardTitle>
                          <p className="text-sm text-muted-foreground">{group.name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={group.enabled ? 'default' : 'destructive'}>
                          {group.enabled ? '启用' : '禁用'}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditGroup(group)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteGroup(group.id, group.name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedGroup(expandedGroup === group.id ? null : group.id)}
                        >
                          {expandedGroup === group.id ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  {expandedGroup === group.id && (
                    <CardContent className="pt-0">
                      <div className="space-y-4">
                        {group.description && (
                          <p className="text-sm text-muted-foreground">{group.description}</p>
                        )}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">路由策略:</span>
                            <Badge variant="outline" className="ml-2">
                              {ROUTING_STRATEGIES.find((s) => s.value === group.routingConfig.strategy)?.label ||
                                group.routingConfig.strategy}
                            </Badge>
                          </div>
                          <div>
                            <span className="text-muted-foreground">流式:</span>
                            <span className="ml-2">{group.capabilities.streaming ? '✓' : '✗'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">函数调用:</span>
                            <span className="ml-2">{group.capabilities.functionCalling ? '✓' : '✗'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">视觉:</span>
                            <span className="ml-2">{group.capabilities.vision ? '✓' : '✗'}</span>
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button size="sm" variant="outline" onClick={() => handleAddInstance(group.id)}>
                            <Plus className="mr-2 h-4 w-4" />
                            添加实例
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* 模型实例标签页 */}
        <TabsContent value="instances">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>模型实例列表</CardTitle>
                <Button onClick={() => handleAddInstance()}>
                  <Plus className="mr-2 h-4 w-4" />
                  添加实例
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {groupsLoading ? (
                <div className="text-center py-8 text-muted-foreground">加载中...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>实例名称</TableHead>
                      <TableHead>模型组</TableHead>
                      <TableHead>供应商</TableHead>
                      <TableHead>实际模型</TableHead>
                      <TableHead>权重/优先级</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.flatMap((group) =>
                      (group as any).instances?.map((instance: ModelInstance) => (
                        <TableRow key={instance.id}>
                          <TableCell>
                            <div className="font-medium">{instance.name}</div>
                          </TableCell>
                          <TableCell>{group.displayName}</TableCell>
                          <TableCell>{getProviderName(instance.providerId)}</TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">
                              {instance.actualModelName}
                            </code>
                          </TableCell>
                          <TableCell>
                            {instance.weight} / {instance.priority}
                          </TableCell>
                          <TableCell>
                            <Badge variant={instance.enabled ? 'default' : 'destructive'}>
                              {instance.enabled ? '启用' : '禁用'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditInstance(instance)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleDeleteInstance(instance.id, instance.groupId, instance.name)
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 模型组对话框 */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingGroupId ? '编辑模型组' : '添加模型组'}</DialogTitle>
            <DialogDescription>
              {editingGroupId ? '修改模型组配置信息' : '创建新的模型组'}
            </DialogDescription>
          </DialogHeader>

          <Form {...groupForm}>
            <form onSubmit={groupForm.handleSubmit(onGroupSubmit)} className="space-y-6">
              <div className="space-y-4">
                <h4 className="text-sm font-medium">基本信息</h4>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={groupForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>模型组名称 *</FormLabel>
                        <FormControl>
                          <Input placeholder="gpt-4" {...field} />
                        </FormControl>
                        <FormDescription>用于 API 调用的唯一标识</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={groupForm.control}
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

                <FormField
                  control={groupForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>描述</FormLabel>
                      <FormControl>
                        <Input placeholder="模型组描述..." {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={groupForm.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>类别</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="chat">对话</SelectItem>
                          <SelectItem value="embedding">嵌入</SelectItem>
                          <SelectItem value="image">图像</SelectItem>
                          <SelectItem value="audio">音频</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4 pt-4 border-t">
                <h4 className="text-sm font-medium">能力配置</h4>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={groupForm.control}
                    name="capabilities.streaming"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <FormLabel className="mb-0">流式输出</FormLabel>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={groupForm.control}
                    name="capabilities.functionCalling"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <FormLabel className="mb-0">函数调用</FormLabel>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={groupForm.control}
                    name="capabilities.vision"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <FormLabel className="mb-0">视觉能力</FormLabel>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={groupForm.control}
                    name="capabilities.jsonMode"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <FormLabel className="mb-0">JSON 模式</FormLabel>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <h4 className="text-sm font-medium">路由配置</h4>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={groupForm.control}
                    name="routingStrategy"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>路由策略</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
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
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={groupForm.control}
                    name="fallbackEnabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <FormLabel className="mb-0">故障转移</FormLabel>
                          <FormDescription className="text-xs">主实例失败时自动切换</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setGroupDialogOpen(false)}>
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={createGroup.isPending || updateGroup.isPending}
                >
                  {createGroup.isPending || updateGroup.isPending
                    ? '保存中...'
                    : editingGroupId
                      ? '保存更改'
                      : '创建'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* 模型实例对话框 */}
      <Dialog open={instanceDialogOpen} onOpenChange={setInstanceDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingInstanceId ? '编辑模型实例' : '添加模型实例'}</DialogTitle>
            <DialogDescription>
              {editingInstanceId ? '修改模型实例配置' : '将供应商模型添加到模型组'}
            </DialogDescription>
          </DialogHeader>

          <Form {...instanceForm}>
            <form onSubmit={instanceForm.handleSubmit(onInstanceSubmit)} className="space-y-4">
              <FormField
                control={instanceForm.control}
                name="groupId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>模型组 *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="选择模型组" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {groups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={instanceForm.control}
                name="providerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>供应商 *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
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

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={instanceForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>实例名称 *</FormLabel>
                      <FormControl>
                        <Input placeholder="OpenAI GPT-4" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={instanceForm.control}
                  name="actualModelName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>实际模型名称 *</FormLabel>
                      <FormControl>
                        <Input placeholder="gpt-4-turbo-preview" {...field} />
                      </FormControl>
                      <FormDescription>供应商 API 中的模型名称</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={instanceForm.control}
                  name="weight"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>权重</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                        />
                      </FormControl>
                      <FormDescription>用于加权路由</FormDescription>
                    </FormItem>
                  )}
                />
                <FormField
                  control={instanceForm.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>优先级</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                        />
                      </FormControl>
                      <FormDescription>数字越小优先级越高</FormDescription>
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setInstanceDialogOpen(false)}>
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={createInstance.isPending || updateInstance.isPending}
                >
                  {createInstance.isPending || updateInstance.isPending
                    ? '保存中...'
                    : editingInstanceId
                      ? '保存更改'
                      : '创建'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
