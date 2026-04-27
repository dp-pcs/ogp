import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createGracefulShutdownHandler,
  resetGracefulShutdownStateForTests
} from '../src/daemon/server.js';

describe('graceful shutdown handler', () => {
  afterEach(() => {
    resetGracefulShutdownStateForTests();
    vi.restoreAllMocks();
  });

  it('stops rendezvous, closes the server, and exits 0 on clean shutdown', async () => {
    const disconnectBridge = vi.fn();
    const stopDoormanCleanup = vi.fn();
    const stopReplyCleanup = vi.fn();
    const stopHeartbeat = vi.fn();
    const stopRendezvous = vi.fn().mockResolvedValue(undefined);
    const clearTimer = vi.fn();
    const exit = vi.fn() as unknown as (code: number) => never;
    const logError = vi.fn();
    const setTimer = vi.fn((fn: () => void) => ({ unref: vi.fn(), fn })) as unknown as typeof setTimeout;
    const close = vi.fn((cb: (error?: Error) => void) => cb());

    const shutdown = createGracefulShutdownHandler({
      disconnectBridge,
      stopDoormanCleanup,
      stopReplyCleanup,
      stopHeartbeat,
      stopRendezvous,
      getServer: () => ({ close }),
      exit,
      setTimer,
      clearTimer: clearTimer as unknown as typeof clearTimeout,
      logError
    });

    await shutdown('SIGTERM');

    expect(disconnectBridge).toHaveBeenCalledOnce();
    expect(stopDoormanCleanup).toHaveBeenCalledOnce();
    expect(stopReplyCleanup).toHaveBeenCalledOnce();
    expect(stopHeartbeat).toHaveBeenCalledOnce();
    expect(stopRendezvous).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(clearTimer).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
    expect(logError).not.toHaveBeenCalled();
  });

  it('exits 1 when server close returns an error', async () => {
    const exit = vi.fn() as unknown as (code: number) => never;
    const logError = vi.fn();
    const clearTimer = vi.fn();
    const setTimer = vi.fn((fn: () => void) => ({ unref: vi.fn(), fn })) as unknown as typeof setTimeout;
    const closeError = new Error('close failed');

    const shutdown = createGracefulShutdownHandler({
      disconnectBridge: vi.fn(),
      stopDoormanCleanup: vi.fn(),
      stopReplyCleanup: vi.fn(),
      stopHeartbeat: vi.fn(),
      stopRendezvous: vi.fn().mockResolvedValue(undefined),
      getServer: () => ({
        close: (cb: (error?: Error) => void) => cb(closeError)
      }),
      exit,
      setTimer,
      clearTimer: clearTimer as unknown as typeof clearTimeout,
      logError
    });

    await shutdown('SIGINT');

    expect(clearTimer).toHaveBeenCalledOnce();
    expect(logError).toHaveBeenCalledWith('[OGP] Error during SIGINT shutdown:', closeError);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
