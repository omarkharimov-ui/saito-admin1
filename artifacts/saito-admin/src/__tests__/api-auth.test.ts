import { validateAuth, requireAuth, requirePermission, sanitizeStaff, sanitizeStaffArray } from '@/lib/api-auth';

describe('api-auth', () => {
  describe('sanitizeStaff', () => {
    it('should remove pin_hash from staff object', () => {
      const staff = {
        id: '123',
        name: 'Test User',
        pin_hash: 'pbkdf2_sha256$260000$salt$hash',
        role: 'admin',
      };
      const sanitized = sanitizeStaff(staff);
      expect(sanitized.pin_hash).toBeUndefined();
      expect(sanitized.id).toBe('123');
      expect(sanitized.name).toBe('Test User');
    });

    it('should handle null/undefined input', () => {
      expect(sanitizeStaff(null)).toBeNull();
      expect(sanitizeStaff(undefined)).toBeUndefined();
    });
  });

  describe('sanitizeStaffArray', () => {
    it('should remove pin_hash from all staff objects', () => {
      const staffList = [
        { id: '1', name: 'User 1', pin_hash: 'hash1' },
        { id: '2', name: 'User 2', pin_hash: 'hash2' },
      ];
      const sanitized = sanitizeStaffArray(staffList);
      expect(sanitized[0].pin_hash).toBeUndefined();
      expect(sanitized[1].pin_hash).toBeUndefined();
    });
  });

  describe('validateAuth', () => {
    it('should return unauthenticated when no token', async () => {
      const result = await validateAuth();
      expect(result.authenticated).toBe(false);
      expect(result.status).toBe(401);
    });
  });

  describe('requirePermission', () => {
    it('should return unauthenticated when no token', async () => {
      const result = await requirePermission('staff.view');
      expect(result).toBeDefined();
      expect((result as any).status).toBe(401);
    });
  });
});
