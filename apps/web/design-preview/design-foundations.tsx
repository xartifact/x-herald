import { useState } from 'react'

import { AlertTriangle, CheckCircle2, Info, Loader2, Plus, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Button, Input, Switch } from './ui'

export function DesignFoundations() {
  const [enabled, setEnabled] = useState(true)
  const [tab, setTab] = useState('foundations')
  return (
    <section className="foundation-section">
      <div className="system-section-heading">
        <div>
          <span className="eyebrow">ONE SHARED LANGUAGE</span>
          <h2>同一套规则，贯穿每个产品</h2>
        </div>
        <div className="system-tabs" role="tablist" aria-label="设计规范">
          <button
            role="tab"
            aria-selected={tab === 'foundations'}
            onClick={() => setTab('foundations')}
          >
            基础规范
          </button>
          <button
            role="tab"
            aria-selected={tab === 'components'}
            onClick={() => setTab('components')}
          >
            组件与状态
          </button>
        </div>
      </div>
      {tab === 'foundations' ? (
        <div className="foundation-grid">
          <article className="foundation-card typography-card">
            <span className="spec-label">01 / TYPOGRAPHY</span>
            <div className="type-specimen">
              清晰，自有力量。
              <br />
              <span>Clarity by design.</span>
            </div>
            <p>
              系统无衬线字体 · 中文优先保证可读性
              <br />
              模型 ID、代码、数字使用等宽字体
            </p>
            <div className="type-scale">
              <span>
                32 <small>展示</small>
              </span>
              <span>
                24 <small>标题</small>
              </span>
              <span>
                18 <small>分区</small>
              </span>
              <span>
                14 <small>正文</small>
              </span>
              <span>
                12 <small>辅助</small>
              </span>
            </div>
            <code>Inter / System Sans / SF Mono</code>
          </article>
          <article className="foundation-card">
            <span className="spec-label">02 / SPACE & SHAPE</span>
            <h3>4px 基础节奏</h3>
            <div className="space-scale">
              {[4, 8, 12, 16, 24, 32].map((size) => (
                <div key={size}>
                  <i style={{ height: size }} />
                  <span>{size}</span>
                </div>
              ))}
            </div>
            <div className="radius-scale">
              {[6, 8, 12].map((radius) => (
                <div key={radius} style={{ borderRadius: radius }}>
                  {radius}
                </div>
              ))}
            </div>
            <p>
              小控件 6px · 常规控件 8px · 工作区 12px
              <br />
              桌面控件 36px · 触屏点击区域至少 44px
            </p>
          </article>
          <article className="foundation-card">
            <span className="spec-label">03 / INTERACTION</span>
            <h3>轻反馈，明确的状态</h3>
            <ul className="principle-list">
              <li>
                <strong>Hover</strong>
                <span>表面轻微提亮，不改变尺寸</span>
              </li>
              <li>
                <strong>Focus</strong>
                <span>2px 品牌色轮廓，键盘可见</span>
              </li>
              <li>
                <strong>Motion</strong>
                <span>150–200ms，尊重减少动态设置</span>
              </li>
              <li>
                <strong>Feedback</strong>
                <span>行内状态 + 图标 + 文字</span>
              </li>
            </ul>
            <p>浅色用细边框和轻阴影；深色用表面层次与边框划分区域。</p>
          </article>
        </div>
      ) : (
        <div className="foundation-grid">
          <article className="foundation-card">
            <span className="spec-label">ACTIONS</span>
            <h3>层级清晰的操作</h3>
            <div className="component-stack">
              <Button onClick={() => toast.success('主操作反馈示例')}>
                <Plus />
                创建模型组
              </Button>
              <Button variant="outline" onClick={() => toast('次级操作反馈示例')}>
                次级操作
              </Button>
              <Button variant="ghost" onClick={() => toast('轻量操作反馈示例')}>
                轻量操作
              </Button>
              <Button disabled>
                <Loader2 className="spin" />
                处理中
              </Button>
              <Button
                variant="destructive"
                onClick={() => toast.error('危险操作反馈示例，未删除数据')}
              >
                危险操作
              </Button>
            </div>
            <p>一个区域只有一个主操作，删除使用独立危险色。</p>
          </article>
          <article className="foundation-card">
            <span className="spec-label">INPUT & SELECTION</span>
            <h3>可理解的输入状态</h3>
            <label className="field">
              实例名称
              <Input placeholder="输入一个容易识别的名称" />
            </label>
            <label className="field">
              校验错误示例
              <Input
                aria-invalid="true"
                aria-describedby="demo-error"
                className="demo-invalid"
                placeholder="请输入上游模型 ID"
              />
              <span id="demo-error" className="field-error">
                模型 ID 为必填项
              </span>
            </label>
            <div className="setting-row">
              <span>启用实例</span>
              <Switch
                aria-label="组件示例启用实例"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </div>
          </article>
          <article className="foundation-card">
            <span className="spec-label">SEMANTIC STATUS</span>
            <h3>状态不随品牌色改变</h3>
            <div className="semantic-alert success">
              <CheckCircle2 />
              <span>
                正常运行<small>成功与健康</small>
              </span>
            </div>
            <div className="semantic-alert warning">
              <AlertTriangle />
              <span>
                需要关注<small>警告与风险</small>
              </span>
            </div>
            <div className="semantic-alert danger">
              <XCircle />
              <span>
                请求失败<small>错误与危险</small>
              </span>
            </div>
            <div className="semantic-alert info">
              <Info />
              <span>
                提示信息<small>说明与帮助</small>
              </span>
            </div>
            <p>不只依赖颜色，始终配合图标和文字。</p>
          </article>
        </div>
      )}
    </section>
  )
}
