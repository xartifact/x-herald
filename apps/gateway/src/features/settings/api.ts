import { eq, sql } from '@xartifact/x-herald-db'
import { Hono } from 'hono'

import type { TtfbTimeoutConfig } from '@xartifact/x-herald-shared'

import { getDatabase } from '../../db/client'
import { rootLogger } from '../../lib'
import {
  CB_CONFIG_KEY,
  configureCircuitBreaker,
  TTFB_TIMEOUT_CONFIG_KEY,
  DEFAULT_TTFB_CONFIG,
  configureTtfbTimeout,
  validateTtfbTimeoutConfig,
} from '../../gateway/services'
import { getConfig, setConfig } from '../gateway-config/service'
import { modelGroups, modelGroupMemberships } from '@xartifact/x-herald-db'
import {
  getActiveClassifierPrompt,
  updateClassifierPrompt,
} from './services/classifier-prompt-service'

const logger = rootLogger.child({ module: 'settings' })

/** @deprecated 请使用 CONFIG_KEY_AI_MODEL */
export const CONFIG_KEY_DEFAULT_ANALYSIS_MODEL = 'AI_MODEL_GROUP_ID'
export { CONFIG_KEY_AI_MODEL } from '../../lib'

const DEFAULT_CB_CONFIG = {
  failureThreshold: 3,
  openDurationMs: 60_000,
  maxBackoffMs: 300_000,
  maxTripsBeforeCooldown: 5,
  cooldownDurationMs: 1_800_000,
}

const settingsRoutes = new Hono()

settingsRoutes.get('/', async (c) => {
  try {
    const db = getDatabase()

    const [defaultGroupId, groups, cbConfig, ttfbTimeout] = await Promise.all([
      getConfig<string | null>('AI_MODEL_GROUP_ID', null),
      db
        .select({
          id: modelGroups.id,
          name: modelGroups.name,
          displayName: modelGroups.displayName,
          instanceCount: sql<number>`count(DISTINCT ${modelGroupMemberships.instanceId})`.mapWith(
            Number,
          ),
        })
        .from(modelGroups)
        .leftJoin(modelGroupMemberships, eq(modelGroupMemberships.groupId, modelGroups.id))
        .groupBy(modelGroups.id, modelGroups.name, modelGroups.displayName)
        .orderBy(modelGroups.name),
      getConfig(CB_CONFIG_KEY, DEFAULT_CB_CONFIG),
      getConfig<TtfbTimeoutConfig | null>(TTFB_TIMEOUT_CONFIG_KEY, null),
    ])

    const ttfbValidated = validateTtfbTimeoutConfig(ttfbTimeout ?? DEFAULT_TTFB_CONFIG)
    const ttfbNormalized = ttfbValidated.ok ? ttfbValidated.value : DEFAULT_TTFB_CONFIG

    return c.json({
      success: true,
      data: {
        aiModelGroupId: defaultGroupId,
        availableModelGroups: groups,
        circuitBreaker: cbConfig,
        ttfbTimeout: ttfbNormalized,
      },
    })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get settings')
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    )
  }
})

settingsRoutes.put('/', async (c) => {
  try {
    const body = (await c.req.json()) as {
      aiModelGroupId?: string | null
      circuitBreaker?: {
        failureThreshold: number
        openDurationMs: number
        maxBackoffMs?: number
        maxTripsBeforeCooldown?: number
        cooldownDurationMs?: number
      }
      ttfbTimeout?: Partial<TtfbTimeoutConfig>
    }

    if ('aiModelGroupId' in body) {
      const id = body.aiModelGroupId ?? null

      if (id !== null) {
        const db = getDatabase()
        const exists = await db
          .select({ id: modelGroups.id })
          .from(modelGroups)
          .where(eq(modelGroups.id, id))
          .limit(1)

        if (exists.length === 0) {
          return c.json({ success: false, error: 'Model group not found' }, 404)
        }
      }

      await setConfig(
        'AI_MODEL_GROUP_ID',
        id,
        '系统所有 AI 功能（日志分析、配置助手等）使用的模型组',
      )
    }

    if ('circuitBreaker' in body && body.circuitBreaker) {
      const cb = body.circuitBreaker
      const {
        failureThreshold,
        openDurationMs,
        maxBackoffMs,
        maxTripsBeforeCooldown,
        cooldownDurationMs,
      } = cb

      if (!Number.isInteger(failureThreshold) || failureThreshold < 1 || failureThreshold > 100) {
        return c.json({ success: false, error: 'failureThreshold 必须是 1-100 之间的整数' }, 400)
      }
      if (
        !Number.isInteger(openDurationMs) ||
        openDurationMs < 1000 ||
        openDurationMs > 3_600_000
      ) {
        return c.json(
          { success: false, error: 'openDurationMs 必须是 1000-3600000 之间的整数' },
          400,
        )
      }
      if (maxBackoffMs !== undefined) {
        if (!Number.isInteger(maxBackoffMs) || maxBackoffMs < 1000 || maxBackoffMs > 3_600_000) {
          return c.json(
            { success: false, error: 'maxBackoffMs 必须是 1000-3600000 之间的整数' },
            400,
          )
        }
      }
      if (maxTripsBeforeCooldown !== undefined) {
        if (
          !Number.isInteger(maxTripsBeforeCooldown) ||
          maxTripsBeforeCooldown < 2 ||
          maxTripsBeforeCooldown > 20
        ) {
          return c.json(
            { success: false, error: 'maxTripsBeforeCooldown 必须是 2-20 之间的整数' },
            400,
          )
        }
      }
      if (cooldownDurationMs !== undefined) {
        if (
          !Number.isInteger(cooldownDurationMs) ||
          cooldownDurationMs < 60_000 ||
          cooldownDurationMs > 7_200_000
        ) {
          return c.json(
            { success: false, error: 'cooldownDurationMs 必须是 60000-7200000 之间的整数' },
            400,
          )
        }
      }

      const cbConfig = {
        failureThreshold,
        openDurationMs,
        ...(maxBackoffMs !== undefined && { maxBackoffMs }),
        ...(maxTripsBeforeCooldown !== undefined && { maxTripsBeforeCooldown }),
        ...(cooldownDurationMs !== undefined && { cooldownDurationMs }),
      }
      await setConfig(CB_CONFIG_KEY, cbConfig, '熔断器配置：失败阈值和熔断持续时间')
      configureCircuitBreaker(cbConfig)
    }

    if ('ttfbTimeout' in body && body.ttfbTimeout) {
      // 与当前已存配置合并，避免 partial body 把未传字段打回默认值
      const current = await getConfig<TtfbTimeoutConfig | null>(TTFB_TIMEOUT_CONFIG_KEY, null)
      const validated = validateTtfbTimeoutConfig({
        ...(current ?? DEFAULT_TTFB_CONFIG),
        ...body.ttfbTimeout,
      })
      if (!validated.ok) {
        return c.json({ success: false, error: validated.error }, 400)
      }
      await setConfig(
        TTFB_TIMEOUT_CONFIG_KEY,
        validated.value,
        'TTFB 超时配置：全局预算与单次 attempt 基准',
      )
      configureTtfbTimeout(validated.value)
    }

    return c.json({ success: true })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to update settings')
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    )
  }
})

settingsRoutes.get('/classifier-prompt', async (c) => {
  try {
    const prompt = await getActiveClassifierPrompt()
    return c.json({
      success: true,
      data: {
        content: prompt.content,
        version: prompt.version,
        updatedAt: prompt.updatedAt.toISOString(),
        updatedBy: prompt.updatedBy,
      },
    })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get classifier prompt')
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    )
  }
})

settingsRoutes.put('/classifier-prompt', async (c) => {
  try {
    const body = (await c.req.json()) as { content?: unknown; updatedBy?: string | null }
    if (typeof body.content !== 'string' || body.content.trim().length === 0) {
      return c.json({ success: false, error: 'content 不能为空' }, 400)
    }
    if (body.content.length > 32_000) {
      return c.json({ success: false, error: 'content 长度不能超过 32000 字符' }, 400)
    }
    const updated = await updateClassifierPrompt(
      body.content,
      typeof body.updatedBy === 'string' ? body.updatedBy : null,
    )
    return c.json({
      success: true,
      data: {
        content: updated.content,
        version: updated.version,
        updatedAt: updated.updatedAt.toISOString(),
        updatedBy: updated.updatedBy,
      },
    })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to update classifier prompt')
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    )
  }
})

export default settingsRoutes
