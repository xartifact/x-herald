import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProvidersPage } from './index'

const mockState = vi.hoisted(() => ({
  providers: [{ id: 'provider-1', name: 'Test Provider' }],
  isLoading: false,
  error: null as unknown,
  refetch: vi.fn(),
  instancesLoading: false,
  instancesError: null as unknown,
  refetchInstances: vi.fn(),
  filtered: [{ id: 'provider-1', name: 'Test Provider' }],
  searchQuery: '',
  setSearchQuery: vi.fn(),
}))

vi.mock('../../../components/use-provider-management', () => ({
  useProviderManagement: () => ({
    ...mockState,
    instancesByProvider: new Map([['provider-1', [{ id: 'instance-1', name: 'real-model' }]]]),
    expandedProvider: null,
    showApiKey: {},
    handleAddNew: vi.fn(),
    setExpandedProvider: vi.fn(),
    setShowApiKey: vi.fn(),
    toggleMut: { mutate: vi.fn() },
    handleEdit: vi.fn(),
    handleDeleteProvider: vi.fn(),
    openSyncModels: vi.fn(),
    handleConfigureThinkingMapping: vi.fn(),
    handleAddInstance: vi.fn(),
    handleEditInstance: vi.fn(),
    handleDeleteInstance: vi.fn(),
    handleToggleInstance: vi.fn(),
    getGroupName: vi.fn(),
    dialogOpen: false,
    setDialogOpen: vi.fn(),
    form: {},
    editId: null,
    createMut: { isPending: false },
    updateMut: { isPending: false },
    showApiKeyForm: false,
    setShowApiKeyForm: vi.fn(),
    handleSubmit: vi.fn(),
    instanceDialogOpen: false,
    setInstanceDialogOpen: vi.fn(),
    editingInstanceId: null,
    instanceForm: {},
    instanceSubmitPending: false,
    providers: mockState.providers,
    groups: [],
    onInstanceSubmit: vi.fn(),
    selectedProvider: null,
    syncModelsOpen: false,
    setSyncModelsOpen: vi.fn(),
    thinkingMappingOpen: false,
    setThinkingMappingOpen: vi.fn(),
  }),
}))

vi.mock('@xartifact/x-herald-ui', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
  Card: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  CardContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
  ProviderCard: ({ instances }: { instances: { name: string }[] }) => (
    <div>{instances.map((instance) => instance.name)}</div>
  ),
  ProviderFormDialog: () => null,
  ModelInstanceForm: () => null,
  SyncModelsDialog: () => null,
  ThinkingTypeMappingDialog: () => null,
  PROTOCOL_OPTIONS: [],
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  EmptyState: () => <div>empty</div>,
}))

describe('ProvidersPage instance query status', () => {
  beforeEach(() => {
    Object.assign(mockState, {
      isLoading: false,
      error: null,
      instancesLoading: false,
      instancesError: null,
    })
    mockState.refetch.mockClear()
    mockState.refetchInstances.mockClear()
  })

  it('does not render list content until both queries are ready', () => {
    mockState.instancesLoading = true

    render(<ProvidersPage />)

    expect(screen.getByText('加载中...')).toBeTruthy()
    expect(screen.queryByText('0 个实例')).toBeNull()
  })

  it('shows instance query error and retries both resource queries', () => {
    mockState.instancesError = new Error('instance fetch failed')

    render(<ProvidersPage />)
    fireEvent.click(screen.getByRole('button', { name: '重试' }))

    expect(screen.getByRole('alert').textContent).toContain('无法加载供应商或模型实例')
    expect(mockState.refetch).toHaveBeenCalledOnce()
    expect(mockState.refetchInstances).toHaveBeenCalledOnce()
  })
})
