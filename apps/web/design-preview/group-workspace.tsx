import { useState } from 'react'

import {
  ArrowRight,
  Box,
  ChevronRight,
  Copy,
  GitBranch,
  Layers,
  Plus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'

import { strategies } from './data'
import { InstanceTable } from './instance-table'
import { Button, Empty, SearchBox, Status, Switch } from './ui'

import type { Group, Instance, Provider } from './data'

interface Props {
  groups: Group[]
  instances: Instance[]
  providers: Provider[]
  activeId: string
  onSelect: (id: string) => void
  onEdit: (instance: Instance) => void
  onProvider: (provider: Provider) => void
  onAdd: () => void
  onUpdate: (group: Group) => void
}

export function GroupWorkspace({
  groups,
  instances,
  providers,
  activeId,
  onSelect,
  onEdit,
  onProvider,
  onAdd,
  onUpdate,
}: Props) {
  const [search, setSearch] = useState('')
  const [instanceSearch, setInstanceSearch] = useState('')
  const [tab, setTab] = useState('members')
  const group = groups.find((item) => item.id === activeId) || groups[0]
  const members = group.members
    .map((id) => instances.find((item) => item.id === id)!)
    .filter(Boolean)
  const available = members.filter(
    (item) => item.enabled && providers.find((provider) => provider.id === item.provider)?.enabled,
  ).length
  const filteredGroups = groups.filter((item) =>
    `${item.name} ${item.slug}`.toLowerCase().includes(search.toLowerCase()),
  )
  const shown = members.filter((item) =>
    `${item.name} ${item.model}`.toLowerCase().includes(instanceSearch.toLowerCase()),
  )
  const move = (id: string, direction: number) => {
    const next = [...group.members]
    const from = next.indexOf(id)
    const to = from + direction
    if (to < 0 || to >= next.length) return
    ;[next[from], next[to]] = [next[to], next[from]]
    onUpdate({ ...group, members: next })
    toast.success('组内优先级已更新')
  }
  return (
    <div className="group-workspace">
      <aside className="group-master">
        <div className="master-heading">
          <span>全部模型组</span>
          <span className="count">{groups.length}</span>
        </div>
        <SearchBox value={search} onChange={setSearch} placeholder="搜索模型组…" />
        <div className="group-list">
          {filteredGroups.map((item) => {
            const live = item.members.filter((id) => {
              const instance = instances.find((candidate) => candidate.id === id)
              return (
                instance?.enabled &&
                providers.find((provider) => provider.id === instance.provider)?.enabled
              )
            }).length
            return (
              <button
                key={item.id}
                className={`group-item ${item.id === group.id ? 'selected' : ''}`}
                onClick={() => {
                  onSelect(item.id)
                  setInstanceSearch('')
                  setTab('members')
                }}
              >
                <span className={`group-icon ${item.tone}`}>
                  <Layers size={18} />
                </span>
                <span className="group-label">
                  <strong>{item.name}</strong>
                  <code>{item.slug}</code>
                  <span>
                    {item.members.length} 个实例<span className="dot-divider">·</span>
                    {strategies[item.strategy]}
                  </span>
                </span>
                <span className={`small-dot ${live === 0 ? 'amber' : ''}`} />
              </button>
            )
          })}
          {!filteredGroups.length && <Empty text="未找到模型组" />}
        </div>
        <div className="master-note">
          <GitBranch size={16} />
          <p>
            一个实例可以加入多个模型组，
            <br />
            灵活组合你的模型资源。
          </p>
        </div>
      </aside>
      <section className="group-detail">
        <div className="detail-heading">
          <div className={`large-icon ${group.tone}`}>
            <Layers size={24} />
          </div>
          <div>
            <div className="title-row">
              <h2>{group.name}</h2>
              <Status enabled={available > 0} label={available > 0 ? '可用' : '暂无可用实例'} />
            </div>
            <button
              className="copy-id"
              onClick={async () => {
                await navigator.clipboard.writeText(group.slug)
                toast.success('模型组标识已复制')
              }}
            >
              <code>{group.slug}</code>
              <Copy size={12} />
            </button>
          </div>
        </div>
        <p className="detail-description">{group.description}</p>
        <div className="group-summary">
          <div>
            <span>路由策略</span>
            <strong>
              <GitBranch size={15} />
              {strategies[group.strategy]}
            </strong>
          </div>
          <div>
            <span>可用实例</span>
            <strong>
              {available}
              <small>/ {members.length}</small>
            </strong>
          </div>
          <div>
            <span>故障转移</span>
            <strong>
              <ShieldCheck size={15} />
              {group.fallback ? '已开启' : '未开启'}
            </strong>
          </div>
        </div>
        <div className="detail-tabs" role="tablist" aria-label="模型组详情">
          <button role="tab" aria-selected={tab === 'members'} onClick={() => setTab('members')}>
            模型实例 <span>{members.length}</span>
          </button>
          <button role="tab" aria-selected={tab === 'routing'} onClick={() => setTab('routing')}>
            路由设置
          </button>
        </div>
        {tab === 'members' ? (
          <div className="members-panel">
            <div className="panel-toolbar">
              <SearchBox
                value={instanceSearch}
                onChange={setInstanceSearch}
                placeholder="搜索实例或模型…"
              />
              <Button variant="outline" onClick={onAdd}>
                <Plus />
                添加实例
              </Button>
            </div>
            <InstanceTable
              instances={shown}
              providers={providers}
              onEdit={onEdit}
              onProvider={onProvider}
              onMove={group.strategy === 'priority' && !instanceSearch ? move : undefined}
              onDetach={(id) => {
                onUpdate({ ...group, members: group.members.filter((value) => value !== id) })
                toast.success('已移出本组，实例仍可在其他组使用', {
                  action: { label: '撤销', onClick: () => onUpdate(group) },
                })
              }}
            />
            <div className="table-caption">
              <ShieldCheck size={14} />
              <span>
                {group.strategy === 'priority'
                  ? '按组内优先级选择实例；可在更多菜单中调整顺序。'
                  : '实例按所选策略参与路由，实际结果取决于请求和运行状态。'}
              </span>
            </div>
            <div className="relationship">
              <div>
                <span className="eyebrow">RESOURCE CONNECTION</span>
                <h3>从模型资源到稳定服务</h3>
                <p>同一组连接多家供应商，让上游切换更从容。</p>
              </div>
              <div className="connection-path">
                <span>
                  <Box size={18} />
                  供应商
                </span>
                <ChevronRight size={16} />
                <span>
                  <Layers size={18} />
                  模型实例
                </span>
                <ChevronRight size={16} />
                <span className="active">
                  <Sparkles size={18} />
                  {group.name}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="routing-panel">
            <div className="section-heading">
              <h3>选择路由策略</h3>
              <p>根据工作负载，为模型组选择合适的分发方式。</p>
            </div>
            <div className="strategy-options">
              {Object.entries(strategies).map(([value, label]) => (
                <button
                  key={value}
                  className={group.strategy === value ? 'selected' : ''}
                  onClick={() => {
                    onUpdate({ ...group, strategy: value })
                    toast.success('路由策略已更新（演示）')
                  }}
                >
                  <GitBranch size={20} />
                  <strong>{label}</strong>
                  <p>
                    {value === 'priority'
                      ? '适合主备场景，优先使用排序靠前的实例。'
                      : value === 'smart'
                        ? '根据运行表现动态选择合适的实例。'
                        : '在符合条件的实例之间循环分发请求。'}
                  </p>
                  <span>
                    {group.strategy === value ? '当前策略' : '选择策略'}
                    <ArrowRight size={14} />
                  </span>
                </button>
              ))}
            </div>
            <div className="setting-row">
              <div>
                <strong>故障转移</strong>
                <p>当前实例请求失败时，尝试其他符合条件的实例。</p>
              </div>
              <Switch
                aria-label="故障转移"
                checked={group.fallback}
                onCheckedChange={(fallback) => onUpdate({ ...group, fallback })}
              />
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
