import { ArrowDownToLine, ArrowRight, Check, Layers, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'

import tokenCss from '../../../packages/ui/src/shared/styles/xartifact-tokens.css?raw'
import { palettes, useAppearance } from './appearance'
import { DesignFoundations } from './design-foundations'
import { Button } from './ui'

import type { PaletteId } from './appearance'

function PaletteMiniature({ palette, mode }: { palette: PaletteId; mode: 'light' | 'dark' }) {
  return (
    <div
      className="palette-miniature"
      data-xartifact-palette={palette}
      data-xartifact-mode={mode}
      aria-hidden="true"
    >
      <div className="mini-sidebar">
        <span />
        <i />
        <i className="active" />
        <i />
      </div>
      <div className="mini-workspace">
        <div className="mini-top">
          <i />
          <span />
        </div>
        <div className="mini-card">
          <div>
            <i />
            <span />
          </div>
          <hr />
          <div className="mini-line" />
          <div className="mini-line short" />
        </div>
        <div className="mini-bottom">
          <i />
          <i />
          <i />
        </div>
      </div>
      <span className="mini-mode">
        {mode === 'light' ? <Sun size={11} /> : <Moon size={11} />}
        {mode === 'light' ? 'LIGHT' : 'DARK'}
      </span>
    </div>
  )
}

export function DesignSystem({ onPreview }: { onPreview: () => void }) {
  const { palette, setPalette } = useAppearance()
  const { theme, resolvedTheme } = useTheme()
  const current = palettes.find((item) => item.id === palette)!
  const exportTokens = () => {
    const url = URL.createObjectURL(new Blob([tokenCss], { type: 'text/css;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'xartifact-tokens-v0.1.css'
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.success('已导出完整主题 CSS', { description: '包含四套配色、双明暗模式与语义变量。' })
  }
  return (
    <div className="design-system">
      <section className="system-hero">
        <div>
          <span className="system-kicker">
            <span className="system-logomark">x</span>XARTIFACT DESIGN SYSTEM <span>v0.1</span>
          </span>
          <h1>
            统一的秩序。
            <br />
            <span>有温度的工具。</span>
          </h1>
          <p>
            让每个 xartifact 产品拥有共同的视觉语言。
            <br />
            四套配色，同一套构造；浅色与深色，同样清晰。
          </p>
          <div className="hero-actions">
            <Button onClick={onPreview}>
              在真实页面中体验
              <ArrowRight />
            </Button>
            <Button variant="outline" onClick={exportTokens}>
              <ArrowDownToLine />
              导出设计变量
            </Button>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-grid" />
          <div className="art-tile tile-back">
            <Layers />
          </div>
          <div className="art-tile tile-middle">
            <span />
          </div>
          <div className="art-tile tile-front">
            x<span>artifact</span>
          </div>
          <span className="art-caption">PRECISE. CALM. CONSISTENT.</span>
        </div>
      </section>
      <section className="palette-section">
        <div className="system-section-heading">
          <div>
            <span className="eyebrow">01 — BRAND PALETTES</span>
            <h2>选择气质，保持一致</h2>
          </div>
          <span className="current-appearance">
            当前：{current.name}
            <i />
            {theme === 'system' ? '跟随系统 · ' : ''}
            {resolvedTheme === 'dark' ? '深色' : '浅色'}
          </span>
        </div>
        <div className="palette-grid">
          {palettes.map((item) => (
            <button
              key={item.id}
              className={`palette-card ${item.id === palette ? 'selected' : ''}`}
              aria-pressed={item.id === palette}
              aria-label={`应用${item.name}配色`}
              onClick={() => setPalette(item.id)}
            >
              <div className="palette-preview-pair">
                <PaletteMiniature palette={item.id} mode="light" />
                <PaletteMiniature palette={item.id} mode="dark" />
              </div>
              <div className="palette-card-body">
                <div className="palette-title">
                  <h3>
                    {item.name}
                    <span>{item.english}</span>
                  </h3>
                  {item.id === palette ? (
                    <span className="chosen-indicator">
                      <Check size={12} />
                      使用中
                    </span>
                  ) : item.id === 'iris' ? (
                    <span className="recommended">推荐</span>
                  ) : null}
                </div>
                <p className="palette-character">{item.character}</p>
                <p>{item.description}</p>
                <div className="palette-card-footer">
                  <div className="palette-dots" data-xartifact-palette={item.id}>
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <span>
                    {item.id === palette ? '已应用到整个原型' : '点击应用配色'}
                    <ArrowRight size={12} />
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>
      <section className="token-section">
        <div className="system-section-heading">
          <div>
            <span className="eyebrow">02 — SEMANTIC COLORS</span>
            <h2>颜色有职责，组件有依据</h2>
          </div>
          <span className="section-hint">每个色值都随明暗模式适配</span>
        </div>
        <div className="semantic-token-grid">
          {[
            { key: 'canvas', name: '画布', usage: '页面底色' },
            { key: 'surface', name: '工作区', usage: '卡片与面板' },
            { key: 'raised', name: '浮层', usage: '弹窗与菜单' },
            { key: 'border', name: '分隔', usage: '结构与边界' },
            { key: 'text', name: '正文', usage: '主要内容' },
            { key: 'muted', name: '辅助', usage: '说明与元信息' },
            { key: 'brand', name: '品牌', usage: '主操作与焦点' },
            { key: 'brand-soft', name: '选中', usage: '选区与背景' },
          ].map((item) => (
            <div key={item.key} className="token-sample">
              <div style={{ background: `var(--xa-${item.key})` }} />
              <strong>
                {item.name}
                <span>{item.usage}</span>
              </strong>
              <code>--xa-{item.key}</code>
            </div>
          ))}
        </div>
      </section>
      <DesignFoundations />
      <section className="system-contract">
        <div>
          <span className="eyebrow">DESIGNED TO SCALE</span>
          <h2>统一品牌，不抹平产品差异</h2>
          <p>
            所有产品共用颜色语义、字体、间距、控件与状态。产品个性通过名称、图标和内容表达；全局配色由用户选择，明暗模式默认跟随系统。
          </p>
        </div>
        <div className="contract-rules">
          <div>
            <strong>01</strong>
            <span>颜色基础值 → 语义变量 → 组件</span>
          </div>
          <div>
            <strong>02</strong>
            <span>配色与明暗分离，刷新后保留选择</span>
          </div>
          <div>
            <strong>03</strong>
            <span>正常文字目标对比度 ≥ 4.5:1</span>
          </div>
          <div>
            <strong>04</strong>
            <span>同源标签页同步，跨域需接入账户偏好</span>
          </div>
        </div>
      </section>
    </div>
  )
}
