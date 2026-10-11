import { useState } from 'react'

import { ArrowUpRight, Check, ChevronRight, Globe, Search, Server, ShieldCheck } from 'lucide-react'

import {
  Button,
  Empty,
  SearchBox,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Status,
  Switch,
} from './ui'
import { InstanceTable } from './instance-table'

import type { Instance, Provider } from './data'

interface Props {
  providers: Provider[]
  instances: Instance[]
  selected: Provider | null
  onSelect: (provider: Provider | null) => void
  onEdit: (instance: Instance) => void
  onDiscover: (provider: Provider) => void
  onToggle: (id: string) => void
}

export function ProvidersWorkspace({
  providers,
  instances,
  selected,
  onSelect,
  onEdit,
  onDiscover,
  onToggle,
}: Props) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const shown = providers.filter(
    (provider) =>
      `${provider.name} ${provider.protocol}`.toLowerCase().includes(search.toLowerCase()) &&
      (filter === 'all' || provider.enabled),
  )
  const current = providers.find((provider) => provider.id === selected?.id)
  return (
    <>
      <div className="provider-overview">
        <div>
          <span className="overview-icon mint">
            <Server size={19} />
          </span>
          <div>
            <span>已接入供应商</span>
            <strong>
              {providers.length}
              <small>家</small>
            </strong>
          </div>
        </div>
        <div>
          <span className="overview-icon purple">
            <Globe size={19} />
          </span>
          <div>
            <span>已创建实例</span>
            <strong>
              {instances.length}
              <small>个</small>
            </strong>
          </div>
        </div>
        <div>
          <span className="overview-icon blue">
            <ShieldCheck size={19} />
          </span>
          <div>
            <span>启用的供应商</span>
            <strong>
              {providers.filter((provider) => provider.enabled).length}
              <small>/ {providers.length}</small>
            </strong>
          </div>
        </div>
      </div>
      <section className="providers-panel">
        <div className="panel-toolbar">
          <div className="filter-tabs">
            <button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>
              全部供应商 <span>{providers.length}</span>
            </button>
            <button
              className={filter === 'enabled' ? 'selected' : ''}
              onClick={() => setFilter('enabled')}
            >
              已启用
            </button>
          </div>
          <SearchBox value={search} onChange={setSearch} placeholder="搜索供应商或协议…" />
        </div>
        <div className="table-scroll">
          <table className="provider-table">
            <thead>
              <tr>
                <th>供应商</th>
                <th>接入协议</th>
                <th>模型实例</th>
                <th>配置状态</th>
                <th className="align-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((provider) => (
                <tr key={provider.id}>
                  <td>
                    <button className="provider-identity" onClick={() => onSelect(provider)}>
                      <span className={`provider-avatar ${provider.tone}`}>{provider.initial}</span>
                      <span>
                        <strong>{provider.name}</strong>
                        <code className="secondary-line">{new URL(provider.url).host}</code>
                      </span>
                    </button>
                  </td>
                  <td>
                    <span className="protocol-badge">{provider.protocol}</span>
                  </td>
                  <td>
                    <button className="text-link" onClick={() => onSelect(provider)}>
                      {instances.filter((instance) => instance.provider === provider.id).length}{' '}
                      个实例
                      <ChevronRight size={13} />
                    </button>
                  </td>
                  <td>
                    <Status enabled={provider.enabled} />
                  </td>
                  <td>
                    <div className="row-actions">
                      <Button variant="ghost" size="sm" onClick={() => onDiscover(provider)}>
                        <Search />
                        发现模型
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`查看 ${provider.name}`}
                        onClick={() => onSelect(provider)}
                      >
                        <ArrowUpRight />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!shown.length && <Empty text="未找到供应商" />}
        <div className="table-caption">
          共 {shown.length} 家供应商<span className="push-right">配置状态不代表实时服务健康度</span>
        </div>
      </section>
      <div className="onboarding-strip">
        <span className="large-icon neutral">
          <Globe size={22} />
        </span>
        <div>
          <h3>接入一次，灵活组合</h3>
          <p>发现供应商模型，创建实例，然后加入适合的模型组。</p>
        </div>
        <div className="step-trail">
          <span>
            <Check size={13} />
            接入供应商
          </span>
          <ChevronRight size={14} />
          <span>发现模型</span>
          <ChevronRight size={14} />
          <span>加入模型组</span>
        </div>
      </div>
      <Sheet open={!!current} onOpenChange={(open) => !open && onSelect(null)}>
        <SheetContent className="design-sheet provider-sheet">
          <div className="sheet-heading">
            <span className="eyebrow">PROVIDER DETAILS</span>
            <SheetTitle>{current?.name}</SheetTitle>
            <SheetDescription>连接配置与模型资源</SheetDescription>
          </div>
          {current && (
            <div className="sheet-body">
              <div className="setting-row">
                <div>
                  <strong>启用供应商</strong>
                  <p>停用后，该供应商的实例将停止参与路由。</p>
                </div>
                <Switch
                  checked={current.enabled}
                  aria-label="启用供应商"
                  onCheckedChange={() => onToggle(current.id)}
                />
              </div>
              <div className="connection-card">
                <span className="eyebrow">CONNECTION</span>
                <dl>
                  <div>
                    <dt>协议</dt>
                    <dd>{current.protocol}</dd>
                  </div>
                  <div>
                    <dt>API 地址</dt>
                    <dd>
                      <code>{current.url}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>API Key</dt>
                    <dd>
                      <code>sk-••••••••••••••••</code>
                      <span className="muted">示例密钥</span>
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="panel-toolbar">
                <h3>模型实例</h3>
                <Button variant="outline" onClick={() => onDiscover(current)}>
                  <Search />
                  发现模型
                </Button>
              </div>
              <InstanceTable
                providers={providers}
                instances={instances.filter((instance) => instance.provider === current.id)}
                onEdit={onEdit}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
