import { describe, it, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import {
  setupCrudTest,
  teardownCrudTest,
  parseJson,
  authGet,
  authPost,
  uniqueName,
  type CrudTestContext,
} from '../../test/crud-helper';
import { circuitBreakerRegistry } from '../../gateway/services/circuit-breaker-state';

let ctx: CrudTestContext;

describe('circuit-breaker API', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest();
  });

  afterAll(async () => {
    await teardownCrudTest();
  });

  afterEach(() => {
    circuitBreakerRegistry.reset();
  });

  it('GET /api/circuit-breaker/stats returns 200 with empty stats', async () => {
    const res = await authGet(ctx, '/api/circuit-breaker/stats');
    const { status, body } = await parseJson(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.todayOpened).toBe(0);
    expect(body.data.weekOpened).toBe(0);
    expect(body.data.trippedInstanceCount).toBe(0);
    expect(Array.isArray(body.data.topInstances)).toBe(true);
  });

  it('GET /api/circuit-breaker/events returns 200 with empty list', async () => {
    const res = await authGet(ctx, '/api/circuit-breaker/events');
    const { status, body } = await parseJson(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.events)).toBe(true);
    expect(body.data.total).toBe(0);
    expect(body.data.limit).toBe(50);
    expect(body.data.offset).toBe(0);
  });

  it('GET /api/circuit-breaker/events supports pagination and filtering', async () => {
    const res = await authGet(ctx, '/api/circuit-breaker/events?limit=10&offset=5&instanceId=test-id&event=opened');
    const { status, body } = await parseJson(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.limit).toBe(10);
    expect(body.data.offset).toBe(5);
    expect(body.data.total).toBe(0);
  });

  it('GET /api/circuit-breaker/realtime-states returns 200 with empty states', async () => {
    const res = await authGet(ctx, '/api/circuit-breaker/realtime-states');
    const { status, body } = await parseJson(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.instances)).toBe(true);
    expect(body.data.instances).toHaveLength(0);
  });

  it('POST /api/circuit-breaker/:instanceId/reset returns 200', async () => {
    const instanceId = uniqueName('cb');
    const res = await authPost(ctx, `/api/circuit-breaker/${instanceId}/reset`);
    const { status, body } = await parseJson(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.instanceId).toBe(instanceId);
    expect(body.data.action).toBe('reset');
  });

  it('POST /api/circuit-breaker/:instanceId/reset returns 200 after trip', async () => {
    const instanceId = uniqueName('cb');
    await circuitBreakerRegistry.manualTrip(instanceId);
    expect(circuitBreakerRegistry.getState(instanceId)).toBe('open');

    const res = await authPost(ctx, `/api/circuit-breaker/${instanceId}/reset`);
    const { status, body } = await parseJson(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.instanceId).toBe(instanceId);
    expect(body.data.action).toBe('reset');
    expect(circuitBreakerRegistry.getState(instanceId)).toBe('closed');
  });

  it('POST /api/circuit-breaker/:instanceId/trip returns 200', async () => {
    const instanceId = uniqueName('cb');
    const res = await authPost(ctx, `/api/circuit-breaker/${instanceId}/trip`, {
      meta: { instanceName: 'test', groupName: 'g', providerName: 'p' },
    });
    const { status, body } = await parseJson(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.instanceId).toBe(instanceId);
    expect(body.data.action).toBe('trip');
    expect(circuitBreakerRegistry.getState(instanceId)).toBe('open');
  });

  it('GET /api/circuit-breaker/realtime-states returns tracked instances', async () => {
    const instanceId = uniqueName('cb');
    await circuitBreakerRegistry.manualTrip(instanceId);

    const res = await authGet(ctx, '/api/circuit-breaker/realtime-states');
    const { status, body } = await parseJson(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.instances)).toBe(true);
    const instances = body.data.instances as Array<{ instanceId: string; state: string }>;
    expect(instances.length).toBeGreaterThan(0);
    const instance = instances.find((i) => i.instanceId === instanceId);
    expect(instance).toBeDefined();
    expect(instance!.state).toBe('open');
  });
});
