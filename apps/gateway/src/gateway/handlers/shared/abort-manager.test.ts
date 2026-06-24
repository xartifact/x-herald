import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { AbortManager } from './abort-manager';
import { logEventBus } from '../../services/log-event-bus';

describe('AbortManager', () => {
  let abortManager: AbortManager;

  afterEach(() => {
    abortManager.dispose();
  });

  describe('initial state', () => {
    it('should initialize with isClientDisconnected as false', () => {
      abortManager = new AbortManager(undefined);
      expect(abortManager.isClientDisconnected).toBe(false);
    });
  });

  describe('registerClientDisconnect', () => {
    it('should be a no-op when no clientSignal is provided', () => {
      abortManager = new AbortManager(undefined);
      expect(() => {
        abortManager.registerClientDisconnect();
      }).not.toThrow();
    });

    it('should set isClientDisconnected when client signal aborts', () => {
      const clientController = new AbortController();
      abortManager = new AbortManager(clientController.signal);
      abortManager.registerClientDisconnect();

      clientController.abort();

      expect(abortManager.isClientDisconnected).toBe(true);
    });
  });

  describe('createAttempt', () => {
    it('should return controller and cleanup function', () => {
      abortManager = new AbortManager(undefined);
      const result = abortManager.createAttempt(1000, 'test-request', false);

      expect(result.controller).toBeInstanceOf(AbortController);
      expect(typeof result.cleanup).toBe('function');
    });

    it('should abort controller on TTFB timeout', async () => {
      abortManager = new AbortManager(undefined);
      const { controller, cleanup } = abortManager.createAttempt(1, 'test-request', false);

      // Wait for the timeout to fire
      await Bun.sleep(10);

      expect(controller.signal.aborted).toBe(true);
      cleanup();
    });

    it('should abort controller on client disconnect', () => {
      const clientController = new AbortController();
      abortManager = new AbortManager(clientController.signal);
      const { controller, cleanup } = abortManager.createAttempt(10000, 'test-request', false);

      clientController.abort();

      expect(controller.signal.aborted).toBe(true);
      cleanup();
    });

    it('cleanup should clear the TTFB timeout', async () => {
      abortManager = new AbortManager(undefined);
      const { controller, cleanup } = abortManager.createAttempt(1, 'test-request', false);

      // Clean up before timeout fires
      cleanup();

      // Wait longer than the timeout
      await Bun.sleep(10);

      expect(controller.signal.aborted).toBe(false);
    });

    it('cleanup should remove the disconnect event listener', () => {
      const clientController = new AbortController();
      abortManager = new AbortManager(clientController.signal);
      const { controller, cleanup } = abortManager.createAttempt(10000, 'test-request', false);

      // Clean up before client disconnects
      cleanup();

      // Client disconnects — listener should have been removed
      clientController.abort();

      expect(controller.signal.aborted).toBe(false);
    });
  });

  describe('setLogId', () => {
    it('should register the abort controller with logEventBus after createAttempt', () => {
      abortManager = new AbortManager(undefined);
      abortManager.setLogId('test-log-id');
      const { controller, cleanup } = abortManager.createAttempt(10000, 'test-request', false);

      // Verify registration via abortRequest — calls controller.abort() if found
      const found = logEventBus.abortRequest('test-log-id');
      expect(controller.signal.aborted).toBe(true);
      // abortRequest returns whether the request was in activeStreams — not our concern
      // but the side effect (controller aborted) confirms registration
      cleanup();
    });
  });

  describe('dispose', () => {
    it('should call the cleanup function and prevent timeout from firing', async () => {
      abortManager = new AbortManager(undefined);
      const { controller } = abortManager.createAttempt(1, 'test-request', false);

      // Dispose before timeout fires
      abortManager.dispose();

      await Bun.sleep(10);

      expect(controller.signal.aborted).toBe(false);
    });

    it('should be a no-op when no attempt was created', () => {
      abortManager = new AbortManager(undefined);
      expect(() => {
        abortManager.dispose();
      }).not.toThrow();
    });
  });
});