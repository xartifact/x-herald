/**
 * Gateway Config 模块
 * 管理网关动态配置
 */

export { gatewayConfigs, CONFIG_KEYS, type GatewayConfig, type NewGatewayConfig, type ModelMappingConfig } from './db';

export {
  getConfig,
  setConfig,
  getModelMappingConfig,
  setModelMappingConfig,
  clearConfigCache,
  initConfigCache,
  getAllConfigs,
} from './service';
