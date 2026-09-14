import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';

// S-4a (Pre-P7 cleanup, ratified 2026-09-14): `expenses` is RLS-OFF and anon DML
// is revoked from it. The GET above keeps working (anon SELECT retained; RLS-off
// read posture unchanged). The POST used the anon client (`@/lib/supabase` is a
// re-export of the anon-key client) — switched to createAuthClient() (service_role)
// so the write survives the anon revoke, matching /api/payment-methods.

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;
  try {
    const { searchParams } = new URL(req.url);
    const staffId = searchParams.get('staff_id');
    const month = searchParams.get('month');
    
    let query = supabase.from('expenses').select('*').order('expense_date', { ascending: false });
    
    if (staffId) query = query.eq('staff_id', staffId);
    if (month) {
      const start = new Date(`${month}-01`);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      query = query.gte('expense_date', start.toISOString().split('T')[0]).lte('expense_date', end.toISOString().split('T')[0]);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;
  try {
    const body = await req.json();
    const { staff_id, category, amount, note, expense_date } = body;
    
    if (!staff_id) return NextResponse.json({ error: 'staff_id required' }, { status: 400 });
    if (!amount || Number(amount) <= 0) return NextResponse.json({ error: 'amount must be positive' }, { status: 400 });
    
    const client = await createAuthClient();
    const { data, error } = await client.from('expenses').insert([
      {
        staff_id,
        category: category || 'salary',
        amount: Number(amount) || 0,
        note: note || '',
        expense_date: expense_date || new Date().toISOString().split('T')[0],
        created_by: auth.user?.id || null,
      }
    ]).select().single();
    
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
