import { describe, expect, it } from 'vitest';
import { NetworkManager } from '../NetworkManager';
import { validateRoomCode } from '../MessageValidator';

const ROOM_CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

function generateRoomCode(): string {
  const manager = NetworkManager.getInstance() as unknown as { generateRoomCode(): string };
  return manager.generateRoomCode();
}

describe('NetworkManager.generateRoomCode', () => {
  it('returns a 6-character code', () => {
    const code = generateRoomCode();
    expect(typeof code).toBe('string');
    expect(code).toHaveLength(6);
  });

  it('only uses characters from the unambiguous charset', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(ROOM_CODE_RE);
      for (const ch of code) {
        expect(ROOM_CODE_CHARSET.includes(ch)).toBe(true);
      }
    }
  });

  it('never emits the ambiguous characters I, O, 0 or 1', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateRoomCode();
      for (const ch of ['I', 'O', '0', '1']) {
        expect(code.includes(ch)).toBe(false);
      }
    }
  });

  it('produces codes accepted by validateRoomCode', () => {
    for (let i = 0; i < 100; i++) {
      expect(validateRoomCode(generateRoomCode())).toEqual({ valid: true });
    }
  });

  it('produces varied codes across calls', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 200; i++) {
      codes.add(generateRoomCode());
    }
    expect(codes.size).toBeGreaterThan(150);
  });
});
