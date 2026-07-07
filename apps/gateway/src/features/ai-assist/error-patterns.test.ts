import { describe, it, expect, beforeEach } from 'bun:test'
import { ErrorPatternLearner, clearErrorPatternCache } from './error-patterns'

function clearCache(): void {
  clearErrorPatternCache()
}

describe('ErrorPatternLearner', () => {
  beforeEach(() => {
    clearCache()
  })

  it('recordResolution adds new pattern with count=1', async () => {
    const learner = new ErrorPatternLearner()
    await learner.recordResolution({
      errorType: 'rate_limit',
      provider: 'OpenAI',
      model: 'gpt-4',
      fix: 'retry',
    })
    const patterns = await learner.getCommonPatterns()
    expect(patterns).toHaveLength(1)
    expect(patterns[0].count).toBe(1)
  })

  it('recordResolution increments count on repeat call (same key)', async () => {
    const learner = new ErrorPatternLearner()
    await learner.recordResolution({
      errorType: 'rate_limit',
      provider: 'OpenAI',
      model: 'gpt-4',
      fix: 'retry',
    })
    await learner.recordResolution({
      errorType: 'rate_limit',
      provider: 'OpenAI',
      model: 'gpt-4',
      fix: 'retry',
    })
    const patterns = await learner.getCommonPatterns()
    expect(patterns).toHaveLength(1)
    expect(patterns[0].count).toBe(2)
  })

  it('findKnownFix returns null when count < 2 (below threshold)', async () => {
    const learner = new ErrorPatternLearner()
    await learner.recordResolution({
      errorType: 'rate_limit',
      provider: 'OpenAI',
      model: 'gpt-4',
      fix: 'retry',
    })
    const fix = await learner.findKnownFix({
      errorType: 'rate_limit',
      provider: 'OpenAI',
      model: 'gpt-4',
    })
    expect(fix).toBeNull()
  })

  it('findKnownFix returns fix string when count >= 2', async () => {
    const learner = new ErrorPatternLearner()
    await learner.recordResolution({
      errorType: 'rate_limit',
      provider: 'OpenAI',
      model: 'gpt-4',
      fix: 'retry',
    })
    await learner.recordResolution({
      errorType: 'rate_limit',
      provider: 'OpenAI',
      model: 'gpt-4',
      fix: 'retry',
    })
    const fix = await learner.findKnownFix({
      errorType: 'rate_limit',
      provider: 'OpenAI',
      model: 'gpt-4',
    })
    expect(fix).toBe('retry')
  })

  it('findKnownFix returns null for unknown error key', async () => {
    const learner = new ErrorPatternLearner()
    const fix = await learner.findKnownFix({
      errorType: 'not_found',
      provider: 'Unknown',
      model: 'unknown',
    })
    expect(fix).toBeNull()
  })

  it('getCommonPatterns returns top N sorted by count DESC', async () => {
    const learner = new ErrorPatternLearner()
    await learner.recordResolution({ errorType: 'a', provider: 'p', model: 'm', fix: 'fix1' })
    await learner.recordResolution({ errorType: 'a', provider: 'p', model: 'm', fix: 'fix1' })
    await learner.recordResolution({ errorType: 'b', provider: 'p', model: 'm', fix: 'fix2' })
    await learner.recordResolution({ errorType: 'b', provider: 'p', model: 'm', fix: 'fix2' })
    await learner.recordResolution({ errorType: 'b', provider: 'p', model: 'm', fix: 'fix2' })
    await learner.recordResolution({ errorType: 'c', provider: 'p', model: 'm', fix: 'fix3' })
    const patterns = await learner.getCommonPatterns()
    expect(patterns[0].errorType).toBe('b')
    expect(patterns[0].count).toBe(3)
    expect(patterns[1].errorType).toBe('a')
    expect(patterns[1].count).toBe(2)
    expect(patterns[2].errorType).toBe('c')
    expect(patterns[2].count).toBe(1)
  })

  it('getCommonPatterns respects limit parameter', async () => {
    const learner = new ErrorPatternLearner()
    await learner.recordResolution({ errorType: 'a', provider: 'p', model: 'm', fix: 'fix1' })
    await learner.recordResolution({ errorType: 'b', provider: 'p', model: 'm', fix: 'fix2' })
    await learner.recordResolution({ errorType: 'c', provider: 'p', model: 'm', fix: 'fix3' })
    const patterns = await learner.getCommonPatterns(2)
    expect(patterns).toHaveLength(2)
  })

  it('Cache persists across instances (globalThis singleton)', async () => {
    const learner1 = new ErrorPatternLearner()
    await learner1.recordResolution({ errorType: 'test', provider: 'p', model: 'm', fix: 'fix' })
    const learner2 = new ErrorPatternLearner()
    const patterns = await learner2.getCommonPatterns()
    expect(patterns).toHaveLength(1)
    expect(patterns[0].count).toBe(1)
  })
})
