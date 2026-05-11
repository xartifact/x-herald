/**
 * bun:test 全局 setup
 * 
 * 在 bunfig.toml 中通过 preload 引用，或手动 import：
 *   import './test/setup'
 * 
 * 职责：
 * - 清理 mock 状态
 * - 设置默认时区
 * - 抑制开发环境日志噪音
 */

// 设置时区，确保时间相关测试稳定
process.env.TZ = 'UTC'

// 清理全局缓存（每个测试文件之间）
// 注意：bun:test 的 beforeEach/afterEach 在每个 test 文件内生效
// 此文件仅用于全局初始化
