import type { Skill } from '../types'
import { builtInTools } from '../tools'

// 错误诊断技能
export const errorDiagnosisSkill: Skill = {
  name: 'error-diagnosis',
  description: '诊断 LLM API 请求错误并提供修复建议',
  systemPrompt: `你是一个 LLM API 错误诊断专家。

当用户报告请求错误时：
1. 使用 diagnose_error 工具获取错误详情
2. 分析错误原因（参数错误、认证问题、速率限制、Provider 问题等）
3. 如果可以自动修复，使用 apply_fix 工具应用修复
4. 如果需要查看配置，使用 get_config 工具

返回清晰的诊断结果和修复建议。`,
  tools: [
    builtInTools.diagnoseError,
    builtInTools.applyFix,
    builtInTools.getConfig,
    builtInTools.getLog,
  ],
}

// 配置生成技能
export const configGenerationSkill: Skill = {
  name: 'config-generation',
  description: '根据描述生成模型实例配置',
  systemPrompt: `你是一个 LLM API 配置专家。

根据用户描述，生成合适的 InstanceConfig 配置：
- requestInject: 注入到请求体的字段（如千问的 enable_search）
- requestTransform: 请求体变换表达式
- responseExtract: 从响应提取字段到标准位置（如 Kimi 的 reasoning_content）
- responseTransform: 响应体变换表达式
- parameterTransforms: 参数变换规则
- customHeaders: 自定义请求头
- patchMissingReasoningContent: 是否修补 reasoning_content

使用 get_config 工具查看现有配置作为参考。
使用 apply_fix 工具应用新配置。`,
  tools: [
    builtInTools.getConfig,
    builtInTools.applyFix,
  ],
}

export const allSkills = {
  'error-diagnosis': errorDiagnosisSkill,
  'config-generation': configGenerationSkill,
}
