/**
 * Phase 2 placeholder — seed functionality will be moved in Phase 3.8
 * when feature backend modules exist in engine/src/.
 * 
 * The original file at apps/web/src/core/db/seed.ts still handles seeding
 * until the engine feature modules are fully migrated.
 */
import { getDatabase } from './client';

export async function seedSystemData(): Promise<void> {
  // Phase 3: implement feature seeding after feature modules migrate
  const db = getDatabase();
  // Feature-specific seeding deferred to Phase 3.8:
  // - __catchall__ access model
  // - Initial route rules
}
