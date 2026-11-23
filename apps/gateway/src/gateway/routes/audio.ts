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

/**
 * 文字转语音。两个入口指向同一处理器：
 *  - `/audio/speech` 是 OpenAI 规范路径（llama.cpp 也提供）
 *  - `/tts` 是 llama.cpp router 的原生别名，入参语义完全相同
 *
 * 都映射到 `category=tts` 的模型组，因此同一份上游配置能同时服务两类客户端。
 */
audioRoutes.post('/audio/speech', (c) => handleAudioSpeech(c))
audioRoutes.post('/tts', (c) => handleAudioSpeech(c))

export default audioRoutes
