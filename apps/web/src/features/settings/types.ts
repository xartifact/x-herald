export interface AvailableModelGroup {
  id: string;
  name: string;
  displayName: string;
  instanceCount: number;
}

export interface SettingsData {
  defaultAnalysisModelGroupId: string | null;
  availableModelGroups: AvailableModelGroup[];
}

export interface SettingsFormData {
  defaultAnalysisModelGroupId: string | null;
}
