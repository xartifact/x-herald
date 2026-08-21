# x-herald UI 设计风格提案

> 基于现有 shadcn new-york 实现的真实 SPA 截图（apps/web/admin）+ 代码抽象。
> 给出三个明确的设计方向供选型。每个都是一套完整组件库（Button × 5 变体 / Badge × 6 状态 / Card × 3 / Input / Switch / Table 行 / 空态 / 状态徽章）。
> 选完之后会被沉淀到 packages/ui/src 实际实现。

---

## 方向 A · 「现代克制」 (shadcn 现行风格延续 + 微调)

延续现有 shadcn new-york 浅色，并整合从截图抽出的现状细节：

- **色板**：白底 `#FFFFFF` / 主色 `#0F172A` near-black / 边框 `#E2E8F0` slate-200
- **字号**：12 / 13 / 14 / 16 / 18 / 24 / 32（Inter）
- **圆角**：6 / 8 两档
- **边框**：1px hairline
- **阴影**：`shadow-sm` (card) / `shadow` (popover)
- **间距**：4 / 8 / 12 / 16 / 20 / 24 / 32 (Tailwind 标准)

| 组件         | 关键样式                                                                                                                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button       | `default: bg #0F172A white 9px h · outline: 1px border slate-200 · ghost: transparent · destructive: bg #EF4444 · link: underline`                                                                              |
| Badge 状态色 | `启用: bg-blue-100 text-blue-700 · 禁用: bg-slate-100 text-slate-400 · 成功: bg-green-100 text-green-700 · 警告: bg-amber-100 text-amber-700 · 严重: bg-red-100 text-red-700 · 信息: bg-blue-100 text-blue-700` |
| Card         | `bg-white 1px border rounded-xl shadow`                                                                                                                                                                         |
| Input        | `bg-white 1px border rounded-md h-9/10 px-3 font-normal`                                                                                                                                                        |
| Switch       | `36×20 / 14×14 圆 thumb / on: green-600, off: slate-300`                                                                                                                                                        |
| Table 行     | `py-3 px-6 · 偶数行 bg #F8FAFC · hover bg #F1F5F9`                                                                                                                                                              |
| 空态         | `圆形 success-fill 36×36 + 文字 14px medium`                                                                                                                                                                    |

字体：Inter / 数字字重：粗体 24-28

---

## 方向 B · 「密度提升 + 中性灰」

整体更紧凑、信息密度更大，用边框 weight 替代颜色强调：

- **色板**：白底 / 主色 `#18181B` (zinc-900) / 边框 `#E4E4E7` (zinc-200) / 强调色 `#2563EB` blue
- **字号**：11 / 12 / 13 / 14 / 18 / 24（更小）
- **圆角**：4 / 6 (更小)
- **边框**：1px / **关键边**：2px 焦点边框 (#2563EB)
- **阴影**：几乎不用，用 border 切层
- **间距**：2 / 4 / 6 / 8 / 12 / 16 (紧凑)

| 组件       | 区别                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| Button     | `default: bg #18181B white 8px h · 焦点: 2px blue ring · outline: 1px zinc-300`                                   |
| Badge 状态 | 用 **border + dot** 取代色块背景：`▸ ●启用 border-blue-300 text-blue-700 · ●禁用 border-slate-300 text-slate-400` |
| Card       | `bg-white 1px border rounded-md 无 shadow`                                                                        |
| Input      | `bg-white 1px border zinc-300 h-8 · 焦点 1px blue`                                                                |
| Switch     | `28×16 / 12×12 thumb`                                                                                             |
| Table 行   | `py-2 px-4 · 1px zinc-200 分隔 · 无 hover bg`                                                                     |

视觉风格：像 Linear / Vercel dashboard，冷静、信息密集。

---

## 方向 C · 「温暖现代 · 品牌特色」

加入品牌色（深蓝绿 `#0E7C66` / 暖琥珀 `#D97706`）+ 软阴影 + 较大间距：

- **色板**：白底 / 主色 `#0E7C66` 青绿（深 LLM brand） / 强调 `#D97706` 琥珀 / 边框 `#E5E7EB`
- **字号**：12 / 14 / 16 / 18 / 22 / 28
- **圆角**：8 / 12 (中等偏大)
- **阴影**：`shadow-md` 软阴影偏温暖
- **间距**：6 / 12 / 16 / 20 / 28 / 36
- **顶部色块**：顶部导航底部 4px 青绿色条带

| 组件       | 特色                                                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button     | `default: bg #0E7C66 white 10px h · 次按钮: bg-amber-500 black · 强调: gradient`                                                                                     |
| Badge 状态 | 多彩低饱和：`启用: bg-emerald-50 text-emerald-700 · 禁用: bg-slate-50 text-slate-400 · 成功: bg-emerald-50 · 警告: bg-amber-50 · 严重: bg-rose-50 · 信息: bg-sky-50` |
| Card       | `bg-white 1px border rounded-xl 12px shadow-md` 软投影                                                                                                               |
| Input      | `bg-white 1px border rounded-lg h-10 px-4 · 大字号 14`                                                                                                               |
| Switch     | `40×22 / 18×18 thumb · on: 青绿`                                                                                                                                     |
| Table      | `py-4 px-6 · 偶数行 subtle bg-stone-50/40 · hover shadow`                                                                                                            |

视觉风格：像 Notion / Stripe dashboard，企业温暖，可识别。

---

## 比较矩阵

| 维度           | A 克制          | B 密度          | C 温暖     |
| -------------- | --------------- | --------------- | ---------- |
| 信息密度       | 中              | 高              | 低         |
| 颜色权重       | 低（中立）      | 极低（neutral） | 中（品牌） |
| 视觉冲击       | 弱              | 弱              | 强         |
| 可识别度       | 中              | 低              | **高**     |
| 实施成本       | 几乎 0 (现有改) | 中              | 中         |
| 文件字体可读性 | 高              | 高              | 高         |

> 现有 SPA 真实截图显示当前是 **A 的默认样式**。用户可能想要 A 的**收敛化版**或 C 的**有特色版**。

---

## 下一步

1. 用户从以上 3 选 1（或混搭），将细节写到 `docs/design-system/x-herald-style-guide.md`
2. 我在 OpenPencil 用 MCP `render` 画该风格完整 Component Kit（10+ 组件）
3. 沉淀到 `packages/ui/src/shared/components/ui/` 替换现有 shadcn 组件
4. 重画 5 屏（每屏都是 component 实例组合）
