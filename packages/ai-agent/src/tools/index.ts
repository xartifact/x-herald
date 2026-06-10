// 内置工具定义（纯定义，不执行）
// 执行逻辑在 engine 中实现

export const builtInTools = {
  // 错误诊断工具
  diagnoseError: {
    name: 'diagnose_error',
    description: '诊断 LLM API 请求错误并提供修复建议',
    parameters: {
      type: 'object',
      properties: {
        logId: { type: 'string', description: '请求日志 ID' },
      },
      required: ['logId'],
    },
  },

  // 应用修复工具
  applyFix: {
    name: 'apply_fix',
    description: '应用修复建议到模型实例配置',
    parameters: {
      type: 'object',
      properties: {
        instanceId: { type: 'string', description: '模型实例 ID' },
        config: { type: 'object', description: '配置变更' },
      },
      required: ['instanceId', 'config'],
    },
  },

  // 获取配置工具
  getConfig: {
    name: 'get_config',
    description: '获取模型实例的当前配置',
    parameters: {
      type: 'object',
      properties: {
        instanceId: { type: 'string', description: '模型实例 ID' },
      },
      required: ['instanceId'],
    },
  },

  // 获取日志工具
  getLog: {
    name: 'get_log',
    description: '获取请求日志详情',
    parameters: {
      type: 'object',
      properties: {
        logId: { type: 'string', description: '日志 ID' },
      },
      required: ['logId'],
    },
  },
}
