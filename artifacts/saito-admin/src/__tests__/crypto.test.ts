import { hashPin, verifyPin } from '@/lib/crypto';

describe('crypto', () => {
  describe('hashPin', () => {
    it('should hash a 4-digit PIN', () => {
      const hash = hashPin('1234');
      expect(hash).toMatch(/^pbkdf2_sha256\$\d+\$[a-f0-9]+$/);
    });

    it('should produce different hashes for same PIN (random salt)', () => {
      const hash1 = hashPin('1234');
      const hash2 = hashPin('1234');
      expect(hash1).not.toBe(hash2);
    });

    it('should hash different PINs differently', () => {
      const hash1 = hashPin('1234');
      const hash2 = hashPin('5678');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPin', () => {
    it('should verify correct PIN', () => {
      const hash = hashPin('1234');
      expect(verifyPin('1234', hash)).toBe(true);
    });

    it('should reject incorrect PIN', () => {
      const hash = hashPin('1234');
      expect(verifyPin('5678', hash)).toBe(false);
    });

    it('should return false for null hash', () => {
      expect(verifyPin('1234', null as any)).toBe(false);
    });

    it('should return false for invalid hash format', () => {
      expect(verifyPin('1234', 'invalid_hash')).toBe(false);
    });

    it('should return false for empty hash', () => {
      expect(verifyPin('1234', '')).toBe(false);
    });
  });
});
