import { useState } from 'react'
import { createRoot } from 'react-dom/client'

import { Toaster, toast } from 'sonner'
import { useTheme } from 'next-themes'

import { initialGroups, initialInstances, initialProviders } from './data'
import { CreateDialog, Picker } from './dialogs'
import { GroupWorkspace } from './group-workspace'
import { InstanceEditor } from './instance-editor'
import { ProvidersWorkspace } from './providers-workspace'
import { PreviewShell } from './preview-shell'
import { AppearanceProvider } from './appearance'
import { DesignSystem } from './design-system'
import './styles.css'
import './design-system.css'

import type { Instance, Provider } from './data'

function App() {
  const [page, setPage] = useState<'groups' | 'providers' | 'design'>(
    location.hash === '#design' ? 'design' : 'groups',
  )
  const { resolvedTheme } = useTheme()
  const [groups, setGroups] = useState(initialGroups)
  const [instances, setInstances] = useState(initialInstances)
  const [providers, setProviders] = useState(initialProviders)
  const [activeId, setActiveId] = useState('g1')
  const [editing, setEditing] = useState<Instance | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
  const [picking, setPicking] = useState(false)
  const [discovering, setDiscovering] = useState<Provider | null>(null)
  const [creating, setCreating] = useState<'group' | 'provider' | null>(null)
  const group = groups.find((item) => item.id === activeId)!
  const discoveryCandidates: Instance[] = discovering
    ? ['model-standard', 'model-fast', 'model-reasoning']
        .map((model, index) => ({
          id: `${discovering.id}-${model}`,
          name: `${discovering.name} · ${['标准模型', '快速模型', '推理模型'][index]}`,
          model,
          provider: discovering.id,
          enabled: true,
          latency: '—',
          context: '待确认',
        }))
        .filter((candidate) => !instances.some((instance) => instance.id === candidate.id))
    : []
  return (
    <>
      <PreviewShell
        page={page}
        groupCount={groups.length}
        providerCount={providers.length}
        onNavigate={setPage}
        onCreate={() => setCreating(page === 'groups' ? 'group' : 'provider')}
      >
        {page === 'design' ? (
          <DesignSystem onPreview={() => setPage('groups')} />
        ) : page === 'groups' ? (
          <GroupWorkspace
            groups={groups}
            instances={instances}
            providers={providers}
            activeId={activeId}
            onSelect={setActiveId}
            onEdit={setEditing}
            onProvider={(provider) => {
              setPage('providers')
              setSelectedProvider(provider)
            }}
            onAdd={() => setPicking(true)}
            onUpdate={(updated) =>
              setGroups((previous) =>
                previous.map((item) => (item.id === updated.id ? updated : item)),
              )
            }
          />
        ) : (
          <ProvidersWorkspace
            providers={providers}
            instances={instances}
            selected={selectedProvider}
            onSelect={setSelectedProvider}
            onEdit={(instance) => {
              setSelectedProvider(null)
              setEditing(instance)
            }}
            onDiscover={(provider) => {
              setSelectedProvider(null)
              setDiscovering(provider)
            }}
            onToggle={(id) =>
              setProviders((previous) =>
                previous.map((item) =>
                  item.id === id ? { ...item, enabled: !item.enabled } : item,
                ),
              )
            }
          />
        )}
      </PreviewShell>
      {editing && (
        <InstanceEditor
          key={editing.id}
          instance={editing}
          providers={providers}
          groups={groups}
          onClose={() => setEditing(null)}
          onSave={(updated) => {
            setInstances((previous) =>
              previous.map((item) => (item.id === updated.id ? updated : item)),
            )
            setEditing(null)
            toast.success('实例配置已保存（演示）')
          }}
        />
      )}
      {picking && (
        <Picker
          title={`添加实例到「${group.name}」`}
          description="选择现有实例加入模型组，实例仍可被其他组使用。"
          candidates={instances.filter((instance) => !group.members.includes(instance.id))}
          providers={providers}
          onClose={() => setPicking(false)}
          onConfirm={(ids) => {
            setGroups((previous) =>
              previous.map((item) =>
                item.id === activeId ? { ...item, members: [...item.members, ...ids] } : item,
              ),
            )
            setPicking(false)
            toast.success(`已添加 ${ids.length} 个实例`)
          }}
        />
      )}
      {discovering && (
        <Picker
          title={`发现模型 · ${discovering.name}`}
          description="以下为演示模型目录。选择后创建实例，可随后加入模型组。"
          candidates={discoveryCandidates}
          providers={providers}
          onClose={() => setDiscovering(null)}
          onConfirm={(ids) => {
            setInstances((previous) => [
              ...previous,
              ...discoveryCandidates.filter((item) => ids.includes(item.id)),
            ])
            setSelectedProvider(discovering)
            setDiscovering(null)
            toast.success(`已创建 ${ids.length} 个示例实例`)
          }}
        />
      )}
      {creating && (
        <CreateDialog
          kind={creating}
          onClose={() => setCreating(null)}
          onCreate={({ name, identifier }) => {
            if (creating === 'group') {
              if (groups.some((item) => item.slug === identifier)) {
                toast.error('模型组标识已存在')
                return
              }
              const id = crypto.randomUUID()
              setGroups((previous) => [
                ...previous,
                {
                  id,
                  name,
                  slug: identifier,
                  description: '为新场景组合模型资源。',
                  strategy: 'priority',
                  fallback: true,
                  members: [],
                  tone: 'purple',
                },
              ])
              setActiveId(id)
            } else {
              try {
                const url = new URL(identifier)
                if (!['https:', 'http:'].includes(url.protocol)) throw new Error('protocol')
              } catch {
                toast.error('请输入有效的 HTTP / HTTPS 地址')
                return
              }
              setProviders((previous) => [
                ...previous,
                {
                  id: crypto.randomUUID(),
                  name,
                  initial: name[0].toUpperCase(),
                  tone: 'blue',
                  protocol: 'OpenAI',
                  url: identifier,
                  enabled: true,
                },
              ])
            }
            setCreating(null)
            toast.success('创建成功（演示）')
          }}
        />
      )}
      <Toaster
        theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
        position="bottom-right"
        richColors
        closeButton
      />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <AppearanceProvider>
    <App />
  </AppearanceProvider>,
)
