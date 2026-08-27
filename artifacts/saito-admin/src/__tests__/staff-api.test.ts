import { NextRequest } from 'next/server';
import { GET } from '@/app/api/staff/route';
import { GET as GetStaff } from '@/app/api/staff/[id]/route';
import { GET as GetRoles, POST as PostRoles } from '@/app/api/staff/roles/route';

// Mock the api-auth module
jest.mock('@/lib/api-auth', () => ({
  requirePermission: jest.fn(),
  createAuthClient: jest.fn(),
  sanitizeStaff: jest.fn((staff: any) => {
    const { pin_hash, ...rest } = staff;
    return rest;
  }),
  sanitizeStaffArray: jest.fn((staffList: any[]) => staffList.map((s: any) => {
    const { pin_hash, ...rest } = s;
    return rest;
  })),
}));

// Mock fetch
global.fetch = jest.fn();

describe('staff API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/staff', () => {
    it('should return staff list', async () => {
      const mockStaff = [
        { id: '1', name: 'User 1', role: 'admin', pin_hash: 'hash1' },
        { id: '2', name: 'User 2', role: 'waiter', pin_hash: 'hash2' },
      ];

      const mockAuth = { authenticated: true, user: { id: 'admin-1' }, role: 'admin' };
      (requirePermission as jest.Mock).mockResolvedValue(mockAuth);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockStaff,
      });

      const request = new NextRequest('http://localhost:3000/api/staff');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.length).toBe(2);
      expect(data[0].pin_hash).toBeUndefined();
    });
  });

  describe('GET /api/staff/[id]', () => {
    it('should return staff detail', async () => {
      const mockStaff = { id: '1', name: 'User 1', role: 'admin', pin_hash: 'hash1' };

      const mockAuth = { authenticated: true, user: { id: 'admin-1' }, role: 'admin' };
      (requirePermission as jest.Mock).mockResolvedValue(mockAuth);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => [mockStaff],
      });

      const request = new NextRequest('http://localhost:3000/api/staff/1');
      const response = await GetStaff(request, { params: { id: '1' } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.staff.pin_hash).toBeUndefined();
    });
  });

  describe('GET /api/staff/roles', () => {
    it('should return roles and permissions', async () => {
      const mockAuth = { authenticated: true, user: { id: 'admin-1' }, role: 'admin' };
      (requirePermission as jest.Mock).mockResolvedValue(mockAuth);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: '1', name: 'admin' }],
      }).mockResolvedValueOnce({
        ok: true,
        json: async () => [{ key: 'staff.view' }],
      }).mockResolvedValueOnce({
        ok: true,
        json: async () => [{ role_id: '1', permission_key: 'staff.view' }],
      });

      const response = await GetRoles();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.roles.length).toBe(1);
      expect(data.permissions.length).toBe(1);
    });
  });
});
