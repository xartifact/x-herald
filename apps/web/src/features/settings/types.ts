/**
 * 系统配置类型定义
 */

export interface ModelMappingSettings {
  enabled: boolean;
  defaultModelGroup: string;
  defaultGroupExists: boolean;
}

export interface AvailableModelGroup {
  id: string;
  name: string;
  displayName: string;
}

export interface SettingsData {
  modelMapping: ModelMappingSettings;
  availableModelGroups: AvailableModelGroup[];
}

export interface SettingsFormData {
  modelMapping: {
    enabled: boolean;
    defaultModelGroup: string;
  };
}
