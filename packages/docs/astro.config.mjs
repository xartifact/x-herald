import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

export default defineConfig({
  integrations: [
    starlight({
      title: 'x-llm-gateway Docs',
      logo: { src: './public/logo.svg' },
      social: { github: 'https://github.com/xartifact/x-llm-gateway' },
      sidebar: [
        {
          label: '系统架构',
          items: [
            { label: '概览', link: '/architecture/overview/' },
            { label: '路由引擎', link: '/architecture/routing/' },
            { label: '数据流', link: '/architecture/data-flow/' },
          ],
        },
        {
          label: '路由功能',
          items: [
            { label: '规则引擎', link: '/routing/rule-engine/' },
            { label: '意图路由', link: '/routing/intent-routing/' },
            { label: '能力路由', link: '/routing/capability-routing/' },
          ],
        },
        {
          label: '测试方案',
          items: [
            { label: '测试架构', link: '/testing/architecture/' },
            { label: '路由测试', link: '/testing/routing/' },
          ],
        },
        {
          label: '开发指南',
          items: [
            { label: '快速开始', link: '/guide/quickstart/' },
            { label: '添加新功能', link: '/guide/adding-features/' },
          ],
        },
      ],
    }),
  ],
})
