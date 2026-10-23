import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Poller } from '../../src/views/poller';

describe('Poller', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is disabled with interval 0', async () => {
    const tick = vi.fn(async () => undefined);
    const p = new Poller({ intervalSeconds: () => 0, tick });
    p.start();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(tick).not.toHaveBeenCalled();
    expect(p.currentDelayMs).toBeUndefined();
  });

  it('polls every interval, with a 30 s floor', async () => {
    const tick = vi.fn(async () => undefined);
    let seconds = 60;
    const p = new Poller({ intervalSeconds: () => seconds, tick });
    p.start();
    await vi.advanceTimersByTimeAsync(59_000);
    expect(tick).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(2);
    seconds = 5;
    p.start();
    expect(p.currentDelayMs).toBe(30_000);
    p.stop();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it('pauses while inactive (panel hidden)', async () => {
    const tick = vi.fn(async () => undefined);
    let visible = false;
    const p = new Poller({ intervalSeconds: () => 30, tick, isActive: () => visible });
    p.start();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(tick).not.toHaveBeenCalled();
    visible = true;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('backs off after a rate limit and relaxes afterwards', async () => {
    let limited = true;
    const ref: { poller?: Poller } = {};
    const tick = vi.fn(async () => {
      if (limited) ref.poller?.notifyRateLimited();
    });
    const poller = new Poller({ intervalSeconds: () => 30, tick });
    ref.poller = poller;
    poller.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(poller.currentDelayMs).toBe(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(poller.currentDelayMs).toBe(120_000);
    limited = false;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(poller.currentDelayMs).toBe(60_000);
    poller.stop();
  });

  it('keeps polling after a failing tick', async () => {
    const tick = vi.fn(async () => {
      throw new Error('boom');
    });
    const p = new Poller({ intervalSeconds: () => 30, tick });
    p.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(2);
    p.stop();
  });
});
