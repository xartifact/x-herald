export interface ModelMappingResult {
  modelName: string;        // 映射后的模型名称
  isMapped: boolean;        // 是否发生了映射
  originalModel: string;    // 原始请求的模型名称
  mappingType: 'virtual' | 'exact' | 'alias' | 'fallback' | null;
}
