/**
 * Gateway Config 模块
 * 管理网关动态配置
 */

export { gatewayConfigs, type GatewayConfig, type NewGatewayConfig } from './db';

export {
  getConfig,
  setConfig,
  clearConfigCache,
  initConfigCache,
  getAllConfigs,
} from './service';
