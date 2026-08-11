---
title: 能力路由
description: 基于请求内容能力的智能路由
---

## 概述

能力路由（Capability Routing）根据请求内容的能力需求（视觉、TTS、视频等），将请求转发到支持对应能力的模型。

## 能力检测

请求体分析：

| 能力     | 检测方式                              | 路由目标     |
| -------- | ------------------------------------- | ------------ |
| Vision   | `messages[].content` 含 `image_url`   | 多模态模型   |
| TTS      | `messages[].content` 含 `input_audio` | TTS 模型     |
| Video    | `messages[].content` 含 `video_url`   | 视频模型     |
| Tool Use | `tools` 字段非空                      | 工具调用模型 |

## 能力优先级

当请求同时包含多个能力时，按以下优先级路由：

| 优先级 | 能力     |
| ------ | -------- |
| 100    | Video    |
| 90     | Vision   |
| 80     | Audio    |
| 70     | TTS      |
| 60     | Tool Use |
| 10     | Text     |

## 配置

```json
{
  "type": "capability",
  "capabilityMap": {
    "vision": "vision-group-id",
    "tts": "tts-group-id",
    "video": "video-group-id"
  },
  "defaultGroupId": "default-group-id"
}
```

## 测试用例

| 场景   | 输入              | 预期路由              |
| ------ | ----------------- | --------------------- |
| 纯文本 | content: "hello"  | text 组               |
| 视觉   | image_url         | vision 组             |
| 工具   | tools: [...]      | tool_use 组           |
| 多能力 | vision + tool_use | vision 组（高优先级） |
