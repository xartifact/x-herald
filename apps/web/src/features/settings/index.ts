/**
 * 系统设置模块导出
 */

export { default as settingsRoutes } from './api';

export type {
  ModelMappingSettings,
  AvailableModelGroup,
  SettingsData,
  SettingsFormData,
} from './types';

export {
  useSettings,
  useUpdateSettings,
} from './useSettings';
