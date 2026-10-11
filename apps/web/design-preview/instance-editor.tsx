import { useState } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Info, Layers } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button, Input, Sheet, SheetContent, SheetDescription, SheetTitle, Switch } from './ui'

import type { Group, Instance, Provider } from './data'

const schema = z.object({
  name: z.string().trim().min(1, '请输入实例名称'),
  model: z.string().trim().min(1, '请输入上游模型 ID'),
  enabled: z.boolean(),
})
type Fields = z.infer<typeof schema>

export function InstanceEditor({
  instance,
  groups,
  providers,
  onClose,
  onSave,
}: {
  instance: Instance
  groups: Group[]
  providers: Provider[]
  onClose: () => void
  onSave: (instance: Instance) => void
}) {
  const [discarding, setDiscarding] = useState(false)
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: { name: instance.name, model: instance.model, enabled: instance.enabled },
  })
  const memberships = groups.filter((group) => group.members.includes(instance.id))
  const provider = providers.find((item) => item.id === instance.provider)!
  const requestClose = () => (isDirty ? setDiscarding(true) : onClose())
  return (
    <Sheet open onOpenChange={(open) => !open && requestClose()}>
      <SheetContent className="design-sheet editor-sheet">
        <div className="sheet-heading">
          <span className="eyebrow">MODEL INSTANCE</span>
          <SheetTitle>编辑模型实例</SheetTitle>
          <SheetDescription>维护上游连接，以及模型组共享的实例配置。</SheetDescription>
        </div>
        <form
          className="editor-form"
          onSubmit={handleSubmit((values) => onSave({ ...instance, ...values }))}
        >
          <div className="sheet-body">
            <div className="notice">
              <Info size={17} />
              <p>
                此实例被 <strong>{memberships.length} 个模型组</strong>
                使用。修改名称、模型或启用状态，将同时影响这些组。
              </p>
            </div>
            <div className="section-heading">
              <h3>基本信息</h3>
              <p>给实例起一个容易识别的名字。</p>
            </div>
            <label className="field">
              实例名称 <Input {...register('name')} aria-invalid={!!errors.name} />
              {errors.name && <span className="field-error">{errors.name.message}</span>}
            </label>
            <div className="field">
              供应商
              <div className="readonly-provider">
                <span className={`mini-avatar ${provider.tone}`}>{provider.initial}</span>
                {provider.name}
                <span className="protocol-badge">{provider.protocol}</span>
              </div>
            </div>
            <label className="field">
              上游模型 ID
              <Input className="mono-input" {...register('model')} aria-invalid={!!errors.model} />
              <span className="field-hint">请求转发时使用的实际模型标识。</span>
              {errors.model && <span className="field-error">{errors.model.message}</span>}
            </label>
            <div className="setting-row">
              <div>
                <strong>启用实例</strong>
                <p>此设置对所有关联模型组生效。</p>
              </div>
              <Switch
                aria-label="启用实例"
                checked={watch('enabled')}
                onCheckedChange={(enabled) => setValue('enabled', enabled, { shouldDirty: true })}
              />
            </div>
            <div className="section-heading spaced">
              <h3>关联模型组</h3>
              <p>成员关系在模型组页面中管理。</p>
            </div>
            <div className="membership-list">
              {memberships.map((group) => (
                <div key={group.id}>
                  <span className={`group-icon ${group.tone}`}>
                    <Layers size={16} />
                  </span>
                  <strong>{group.name}</strong>
                  <code>{group.slug}</code>
                </div>
              ))}
            </div>
            <details className="advanced">
              <summary>
                能力与高级配置<span>查看示例</span>
              </summary>
              <dl>
                <div>
                  <dt>上下文窗口</dt>
                  <dd>{instance.context}</dd>
                </div>
                <div>
                  <dt>配置策略</dt>
                  <dd>继承默认设置</dd>
                </div>
              </dl>
              <p>完整参数编辑将在正式页面中沿用现有配置表单。</p>
            </details>
          </div>
          <div className="sheet-footer">
            {discarding ? (
              <>
                <span className="unsaved">有未保存的修改</span>
                <Button type="button" variant="outline" onClick={() => setDiscarding(false)}>
                  继续编辑
                </Button>
                <Button type="button" variant="destructive" onClick={onClose}>
                  放弃修改
                </Button>
              </>
            ) : (
              <>
                <span className="unsaved">{isDirty ? '有未保存的修改' : '所有配置已保存'}</span>
                <Button type="button" variant="outline" onClick={requestClose}>
                  取消
                </Button>
                <Button type="submit">
                  <Check />
                  保存更改
                </Button>
              </>
            )}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
