/**
 * Database Schema Aggregation
 *
 * This file aggregates all feature schemas for use by the database client.
 * It must NOT import from './client' to avoid circular dependencies.
 */

// Features schemas
export * from '@/features/providers/db';
export * from '@/features/model-groups/db';
export * from '@/features/keys/db';
export * from '@/features/logs/db';
export * from '@/features/health/db';
export * from '@/features/gateway-config/db';
export * from '@/features/circuit-breaker/db';
export * from '@/features/metrics/db';
