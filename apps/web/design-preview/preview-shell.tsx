import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Box,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Command,
  GitBranch,
  KeyRound,
  Layers,
  LayoutDashboard,
  Menu,
  Plus,
  Palette,
  Radio,
  ScrollText,
  Server,
  Settings2,
  X,
} from 'lucide-react'

import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from './ui'
import { AppearanceControls } from './appearance'

interface Props {
  page: 'groups' | 'providers' | 'design'
  groupCount: number
  providerCount: number
  onNavigate: (page: 'groups' | 'providers' | 'design') => void
  onCreate: () => void
  children: ReactNode
}

export function PreviewShell({
  page,
  groupCount,
  providerCount,
  onNavigate,
  onCreate,
  children,
}: Props) {
  const [mobileNav, setMobileNav] = useState(false)
  const [help, setHelp] = useState(false)
  const pageTitle =
    page === 'design' ? 'xartifact 设计系统' : page === 'groups' ? '模型组管理' : '供应商管理'
  const navigate = (next: 'groups' | 'providers' | 'design') => {
    onNavigate(next)
    setMobileNav(false)
  }
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}>
        <button className="brand" onClick={() => navigate('groups')}>
          <span className="brand-mark">
            <Radio size={21} />
          </span>
          x-herald<span className="brand-tag">GATEWAY</span>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="mobile-close"
          aria-label="关闭导航"
          onClick={() => setMobileNav(false)}
        >
          <X />
        </Button>
        <div className="workspace-switch">
          <span className="workspace-avatar">X</span>
          <span>
            <strong>默认工作空间</strong>
            <small>Personal workspace</small>
          </span>
          <ChevronDown size={14} />
        </div>
        <div className="nav-section-label">工作空间</div>
        <div className="nav-placeholder">
          <LayoutDashboard size={17} />
          概览
        </div>
        <div className="nav-section-label">模型资源</div>
        <nav aria-label="模型资源">
          <button
            className={page === 'providers' ? 'active' : ''}
            onClick={() => navigate('providers')}
          >
            <Server size={17} />
            供应商<span>{providerCount}</span>
          </button>
          <button className={page === 'groups' ? 'active' : ''} onClick={() => navigate('groups')}>
            <Layers size={17} />
            模型组<span>{groupCount}</span>
          </button>
          <div className="nav-placeholder">
            <Box size={17} />
            接入模型
          </div>
          <div className="nav-placeholder">
            <GitBranch size={17} />
            路由规则
          </div>
        </nav>
        <div className="nav-section-label">运行与观测</div>
        <div className="nav-placeholder">
          <KeyRound size={17} />
          虚拟密钥
        </div>
        <div className="nav-placeholder">
          <ScrollText size={17} />
          请求日志
        </div>
        <div className="nav-placeholder">
          <Activity size={17} />
          性能指标
        </div>
        <div className="sidebar-bottom">
          <nav aria-label="设计系统">
            <button
              className={page === 'design' ? 'active' : ''}
              onClick={() => navigate('design')}
            >
              <Palette size={17} />
              设计系统<span>v0.1</span>
            </button>
          </nav>
          <div className="preview-note">
            <span className="small-dot" />
            交互设计预览<p>示例数据 · 仅在当前页面生效</p>
          </div>
          <button className="help-link" onClick={() => setHelp(true)}>
            <BookOpen size={16} />
            原型导览
            <ArrowUpRight size={13} />
          </button>
          <div className="user-profile">
            <span>B</span>
            <div>
              <strong>Workspace admin</strong>
              <small>管理员</small>
            </div>
            <Settings2 size={16} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <Button
            className="mobile-menu"
            variant="ghost"
            size="icon"
            aria-label="打开导航"
            onClick={() => setMobileNav(true)}
          >
            <Menu />
          </Button>
          <div className="breadcrumb">
            工作空间
            <ChevronRight size={13} />
            模型资源
            <ChevronRight size={13} />
            <strong>{pageTitle}</strong>
          </div>
          <div className="topbar-right">
            <AppearanceControls />
            <button aria-label="原型导览" onClick={() => setHelp(true)}>
              <CircleHelp size={18} />
            </button>
            <span className="avatar-small">B</span>
          </div>
        </header>
        <main>
          {page !== 'design' && (
            <div className="page-heading">
              <div>
                <div className="eyebrow">MODEL INFRASTRUCTURE</div>
                <h1>
                  {pageTitle}
                  <span>{page === 'groups' ? groupCount : providerCount}</span>
                </h1>
                <p>
                  {page === 'groups'
                    ? '组合模型资源，让每一次请求都有合适的去处。'
                    : '连接你的模型服务，统一管理上游资源。'}
                </p>
              </div>
              <Button onClick={onCreate}>
                <Plus />
                {page === 'groups' ? '创建模型组' : '添加供应商'}
              </Button>
            </div>
          )}

          {children}
          <footer className="page-footer">
            <span>
              <Command size={12} />
              x-herald / model infrastructure
            </span>
            <span>清晰连接 · 从容管理</span>
          </footer>
        </main>
      </div>

      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogTitle>欢迎体验新的管理界面</DialogTitle>
          <DialogDescription>
            这是独立设计原型，所有操作仅修改页面内的示例数据，刷新即可重置。
          </DialogDescription>
          <ol className="tour-list">
            <li>切换模型组，查看实例与路由设置。</li>
            <li>点击实例名称，在侧栏中编辑并保存。</li>
            <li>点击“添加实例”，体验跨搜索保留选择。</li>
            <li>进入供应商页面，查看详情并发现示例模型。</li>
          </ol>
          <p className="muted">
            导航中的浅色栏目仅用于展示完整控制台的信息层次。测试与性能数据均为演示。
          </p>
          <Button onClick={() => setHelp(false)}>开始体验</Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
