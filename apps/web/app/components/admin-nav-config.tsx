import {
  LayoutDashboard,
  Server,
  Brain,
  Key,
  FileText,
  BarChart3,
  Settings,
  Layers,
  Cog,
  Network,
  GitBranch,
  ShieldAlert,
  Gauge,
  DollarSign,
  Sparkles,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon?: React.ReactNode
}

export interface NavGroup {
  label: string
  icon?: React.ReactNode
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    label: '概览',
    icon: <LayoutDashboard className="h-4 w-4" />,
    items: [{ href: '/admin', label: '控制台', icon: <LayoutDashboard className="h-4 w-4" /> }],
  },
  {
    label: '配置管理',
    icon: <Settings className="h-4 w-4" />,
    items: [
      { href: '/admin/providers', label: '供应商', icon: <Server className="h-4 w-4" /> },
      { href: '/admin/model-groups', label: '模型组', icon: <Layers className="h-4 w-4" /> },
      { href: '/admin/access-models', label: '接入模型', icon: <Network className="h-4 w-4" /> },
      { href: '/admin/model-routes', label: '路由规则', icon: <GitBranch className="h-4 w-4" /> },
      { href: '/admin/keys', label: '密钥', icon: <Key className="h-4 w-4" /> },
      { href: '/admin/settings', label: '系统设置', icon: <Cog className="h-4 w-4" /> },
    ],
  },
  {
    label: '监控分析',
    icon: <BarChart3 className="h-4 w-4" />,
    items: [
      { href: '/admin/logs', label: '请求日志', icon: <FileText className="h-4 w-4" /> },
      { href: '/admin/client-models', label: '模型统计', icon: <Brain className="h-4 w-4" /> },
      { href: '/admin/costs', label: '费用统计', icon: <DollarSign className="h-4 w-4" /> },
      {
        href: '/admin/provider-stats',
        label: '供应商统计',
        icon: <BarChart3 className="h-4 w-4" />,
      },
      {
        href: '/admin/circuit-breaker',
        label: '熔断记录',
        icon: <ShieldAlert className="h-4 w-4" />,
      },
      { href: '/admin/metrics', label: '性能指标', icon: <Gauge className="h-4 w-4" /> },
    ],
  },
  {
    label: '高级',
    icon: <Sparkles className="h-4 w-4" />,
    items: [
      { href: '/admin/ai-assist', label: 'AI 辅助诊断', icon: <Sparkles className="h-4 w-4" /> },
    ],
  },
]

export const allNavItems = navGroups.flatMap((group) => group.items)
