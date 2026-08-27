import { NextRequest } from 'next/server';
import { GET, POST, PATCH } from '@/app/api/shifts/route';

// Mock the api-auth module
jest.mock('@/lib/api-auth', () => ({
  requirePermission: jest.fn(),
}));

// Mock fetch
global.fetch = jest.fn();

describe('shifts API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/shifts', () => {
    it('should return shifts list', async () => {
      const mockShifts = [
        { id: '1', staff_id: '1', opened_at: '2026-08-27T10:00:00Z', closed_at: null },
        { id: '2', staff_id: '2', opened_at: '2026-08-27T09:00:00Z', closed_at: '2026-08-27T17:00:00Z' },
      ];

      const mockAuth = { authenticated: true, user: { id: 'admin-1' }, role: 'admin' };
      (requirePermission as jest.Mock).mockResolvedValue(mockAuth);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockShifts,
      });

      const request = new NextRequest('http://localhost:3000/api/shifts');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.length).toBe(2);
    });

    it('should filter active shifts', async () => {
      const mockShifts = [
        { id: '1', staff_id: '1', opened_at: '2026-08-27T10:00:00Z', closed_at: null },
      ];

      const mockAuth = { authenticated: true, user: { id: 'admin-1' }, role: 'admin' };
      (requirePermission as jest.Mock).mockResolvedValue(mockAuth);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockShifts,
      });

      const request = new NextRequest('http://localhost:3000/api/shifts?active=true');
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/shifts', () => {
    it('should create shift with audit log', async () => {
      const mockAuth = { authenticated: true, user: { id: 'admin-1' }, role: 'admin' };
      (requirePermission as jest.Mock).mockResolvedValue(mockAuth);

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: 'shift-1', staff_id: '1' }],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const request = new NextRequest('http://localhost:3000/api/shifts', {
        method: 'POST',
        body: JSON.stringify({ staff_id: '1', expected_cash: 100 }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('shift-1');
    });
  });

  describe('PATCH /api/shifts', () => {
    it('should close shift with audit log', async () => {
      const mockAuth = { authenticated: true, user: { id: 'admin-1' }, role: 'admin' };
      (requirePermission as jest.Mock).mockResolvedValue(mockAuth);

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: 'shift-1', expected_cash: 100 }],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: 'shift-1', closed_at: '2026-08-27T17:00:00Z' }],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const request = new NextRequest('http://localhost:3000/api/shifts', {
        method: 'PATCH',
        body: JSON.stringify({ id: 'shift-1', closed_at: '2026-08-27T17:00:00Z', actual_cash: 100 }),
      });

      const response = await PATCH(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });
});
