import { Hono } from 'hono'

import type { VirtualKey } from '@xartifact/x-herald-db'

import { handleAudioTranscription } from '../handlers/audio/transcription-handler'
import { handleAudioSpeech } from '../handlers/audio/speech-handler'

const audioRoutes = new Hono<{
  Variables: {
    virtualKey: VirtualKey
  }
}>()

/**
 * OpenAI 兼容音频端点（透传，无转换）。
 *
 * 挂载在 `/api/v1` 下，因此对外路径就是 `/v1/audio/transcriptions`、`/v1/audio/speech`。
 * 鉴权沿用 `virtualKeyMiddleware`（在 gateway/api.ts 统一挂载）。
 */
audioRoutes.post('/audio/transcriptions', (c) => handleAudioTranscription(c))
audioRoutes.post('/audio/speech', (c) => handleAudioSpeech(c))

export default audioRoutes
