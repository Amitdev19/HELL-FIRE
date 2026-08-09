import { describe, expect, it, vi } from 'vitest';
import {
  MessageRateLimiter,
  validateDamage,
  validatePosition,
  validatePositionDelta,
  validateRoomCode,
  validateSyncMessage,
} from '../MessageValidator';
import type { SyncMessage } from '../SyncMessages';

const ROOM_CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

describe('validateRoomCode', () => {
  it('accepts 6-character codes built from the generator charset', () => {
    const codes = ['ABCDEF', 'HJKLMN', 'PQRSTU', 'VWXYZ2', '345678', '9ABCDE'];
    for (const code of codes) {
      expect(code).toHaveLength(6);
      for (const ch of code) {
        expect(ROOM_CODE_CHARSET.includes(ch)).toBe(true);
      }
      expect(validateRoomCode(code)).toEqual({ valid: true });
    }
  });

  it('rejects codes with invalid characters', () => {
    for (const code of ['abcdef', 'AB CDE', 'ABCD-F', 'ABC*EF', 'ÄBCDEF', '']) {
      const result = validateRoomCode(code);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Invalid room code format');
    }
  });

  it('rejects codes with invalid lengths', () => {
    for (const code of ['A', 'AB', 'ABC', 'ABCDEFGHI', 'ABCDEFGHIJKL']) {
      expect(validateRoomCode(code).valid).toBe(false);
    }
    expect(validateRoomCode('ABCD').valid).toBe(true);
    expect(validateRoomCode('ABCDEFGH').valid).toBe(true);
  });
});

describe('validateDamage', () => {
  it('accepts non-negative damage within the cap', () => {
    for (const damage of [0, 1, 42.5, 999, 1000]) {
      expect(validateDamage(damage)).toEqual({ valid: true });
    }
  });

  it('rejects negative damage', () => {
    const result = validateDamage(-1);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Damage cannot be negative');
  });

  it('rejects NaN damage', () => {
    const result = validateDamage(Number.NaN);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Damage must be a number');
  });

  it('rejects damage above the per-hit cap', () => {
    const result = validateDamage(1001);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('exceeds max');
  });
});

describe('validatePosition', () => {
  it('accepts in-bounds positions', () => {
    for (const [x, y] of [
      [0, 0],
      [-1000, -1000],
      [1234, 5678],
      [50000, 50000],
    ]) {
      expect(validatePosition(x, y)).toEqual({ valid: true });
    }
  });

  it('rejects out-of-bounds positions', () => {
    for (const [x, y] of [
      [-1001, 0],
      [0, -1001],
      [50001, 0],
      [0, 50001],
    ]) {
      const result = validatePosition(x, y);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Position out of world bounds');
    }
  });

  it('rejects NaN positions', () => {
    expect(validatePosition(Number.NaN, 0).reason).toBe('Position contains NaN');
    expect(validatePosition(0, Number.NaN).reason).toBe('Position contains NaN');
  });
});

describe('validatePositionDelta', () => {
  it('accepts movement within the per-tick delta budget', () => {
    expect(validatePositionDelta(0, 0, 100, 100)).toEqual({ valid: true });
    expect(validatePositionDelta(500, 500, 450, 560)).toEqual({ valid: true });
  });

  it('rejects teleport-sized jumps', () => {
    const horizontal = validatePositionDelta(0, 0, 101, 0);
    expect(horizontal.valid).toBe(false);
    expect(horizontal.reason).toContain('teleport');
    expect(validatePositionDelta(0, 0, 0, -500).valid).toBe(false);
  });
});

describe('validateSyncMessage', () => {
  it('accepts a message with a type', () => {
    expect(validateSyncMessage({ type: 'player_state' } as unknown as SyncMessage).valid).toBe(true);
  });

  it('rejects a message without a type', () => {
    expect(validateSyncMessage({} as unknown as SyncMessage).valid).toBe(false);
  });
});

describe('MessageRateLimiter', () => {
  it('allows messages up to the limit then rejects rapid sends', () => {
    vi.useFakeTimers();
    try {
      const limiter = new MessageRateLimiter(5);
      const results: boolean[] = [];
      for (let i = 0; i < 8; i++) {
        results.push(limiter.checkAllowed());
      }
      expect(results).toEqual([true, true, true, true, true, false, false, false]);
      expect(results.includes(false)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('refills the budget after one second', () => {
    vi.useFakeTimers();
    try {
      const limiter = new MessageRateLimiter(2);
      expect(limiter.checkAllowed()).toBe(true);
      expect(limiter.checkAllowed()).toBe(true);
      expect(limiter.checkAllowed()).toBe(false);

      vi.advanceTimersByTime(1000);
      expect(limiter.checkAllowed()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the budget on explicit reset', () => {
    vi.useFakeTimers();
    try {
      const limiter = new MessageRateLimiter(1);
      expect(limiter.checkAllowed()).toBe(true);
      expect(limiter.checkAllowed()).toBe(false);
      limiter.reset();
      expect(limiter.checkAllowed()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
