import { eq, and, ne } from 'drizzle-orm';

import { getDatabase } from '@/core/db/client';
import type { VirtualKey } from '@/features/keys/db';
import { modelGroups, virtualModels } from '@/features/model-groups/db';
import { CATCHALL_VM_NAME } from '@/features/virtual-models/constants';

export interface AccessibleModel {
  name: string;
  displayName: string | null;
  createdAt: Date;
}

/**
 * 查询当前 virtualKey 有权访问的模型列表
 * 优先返回虚拟模型，无虚拟模型时回退到模型组
 */
export async function fetchAccessibleModels(virtualKey: VirtualKey): Promise<AccessibleModel[]> {
  const db = getDatabase();

  const enabledVMs = await db
    .select({
      name: virtualModels.name,
      displayName: virtualModels.displayName,
      createdAt: virtualModels.createdAt,
    })
    .from(virtualModels)
    .where(and(eq(virtualModels.enabled, true), ne(virtualModels.name, CATCHALL_VM_NAME)));

  if (enabledVMs.length > 0) {
    const accessible = enabledVMs.filter((vm) => {
      if (!virtualKey.allowedModels?.length) return true;
      return virtualKey.allowedModels.includes(vm.name);
    });
    return accessible;
  }

  const allGroups = await db
    .select({
      name: modelGroups.name,
      displayName: modelGroups.displayName,
      createdAt: modelGroups.createdAt,
    })
    .from(modelGroups)
    .where(eq(modelGroups.enabled, true));

  return allGroups.filter((group) => {
    if (!virtualKey.allowedModels?.length) return true;
    return virtualKey.allowedModels.includes(group.name);
  });
}
