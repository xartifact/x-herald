export interface AvailableModelGroup {
  id: string;
  name: string;
  displayName: string;
  instanceCount: number;
}

export interface SettingsData {
  aiModelGroupId: string | null;
  availableModelGroups: AvailableModelGroup[];
}

export interface SettingsFormData {
  aiModelGroupId: string | null;
}
