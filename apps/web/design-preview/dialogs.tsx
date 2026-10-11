import { useState } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Layers, Plus } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Empty,
  Input,
  SearchBox,
} from './ui'

import type { Instance, Provider } from './data'

export function Picker({
  title,
  description,
  candidates,
  providers,
  onClose,
  onConfirm,
}: {
  title: string
  description: string
  candidates: Instance[]
  providers: Provider[]
  onClose: () => void
  onConfirm: (ids: string[]) => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const shown = candidates.filter((item) =>
    `${item.name} ${item.model} ${providers.find((provider) => provider.id === item.provider)?.name}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="picker-dialog">
        <div className="dialog-top">
          <span className="eyebrow">BUILD YOUR MODEL STACK</span>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </div>
        <SearchBox value={search} onChange={setSearch} placeholder="搜索模型、实例或供应商…" />
        <div className="selection-summary">
          <span>可选 {shown.length} 个实例</span>
          <button
            onClick={() =>
              setSelected([...new Set([...selected, ...shown.map((item) => item.id)])])
            }
          >
            选择搜索结果
          </button>
          <button onClick={() => setSelected([])}>清空选择</button>
        </div>
        <div className="picker-list">
          {shown.map((item) => (
            <label
              className={`picker-item ${selected.includes(item.id) ? 'selected' : ''}`}
              key={item.id}
            >
              <input
                type="checkbox"
                checked={selected.includes(item.id)}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? [...selected, item.id]
                      : selected.filter((id) => id !== item.id),
                  )
                }
              />
              <span className="group-icon purple">
                <Layers size={18} />
              </span>
              <span>
                <strong>{item.name}</strong>
                <code className="secondary-line">{item.model}</code>
              </span>
              <span className="picker-provider">
                {providers.find((provider) => provider.id === item.provider)?.name}
              </span>
            </label>
          ))}
          {!shown.length && <Empty text="没有匹配的实例" />}
        </div>
        <div className="dialog-bottom">
          <span>
            {selected.length
              ? `已选择 ${selected.length} 项，包含其他搜索结果中的选择`
              : '选择要添加的模型实例'}
          </span>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button disabled={!selected.length} onClick={() => onConfirm(selected)}>
            <Plus />
            添加 {selected.length || ''} 个实例
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const createSchema = z.object({
  name: z.string().trim().min(1, '请输入名称'),
  identifier: z.string().trim().min(1, '请输入标识或 API 地址'),
})

export function CreateDialog({
  kind,
  onClose,
  onCreate,
}: {
  kind: 'group' | 'provider'
  onClose: () => void
  onCreate: (value: { name: string; identifier: string }) => void
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: '', identifier: '' },
  })
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="create-dialog">
        <DialogTitle>{kind === 'group' ? '创建模型组' : '添加供应商'}</DialogTitle>
        <DialogDescription>
          {kind === 'group'
            ? '先创建一个分组，再选择需要加入的模型实例。'
            : '预览连接配置流程。示例供应商使用 OpenAI 兼容协议。'}
        </DialogDescription>
        <form onSubmit={handleSubmit(onCreate)}>
          <label className="field">
            {kind === 'group' ? '模型组名称' : '供应商名称'}
            <Input
              placeholder={kind === 'group' ? '例如：内容创作' : '例如：团队模型服务'}
              {...register('name')}
            />
            {errors.name && <span className="field-error">{errors.name.message}</span>}
          </label>
          <label className="field">
            {kind === 'group' ? '模型组标识' : 'API 地址'}
            <Input
              placeholder={kind === 'group' ? 'content-writing' : 'https://api.example.com/v1'}
              {...register('identifier')}
            />
            {errors.identifier && <span className="field-error">{errors.identifier.message}</span>}
          </label>
          <div className="dialog-bottom">
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit">
              <Check />
              {kind === 'group' ? '创建模型组' : '添加供应商'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
