import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const auth = await requireAuth(['admin', 'superadmin', 'manager']);
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
  const auth = await requireAuth(['admin', 'superadmin', 'manager']);
  if (!auth.authenticated) return auth;
  try {
    const body = await req.json();
    const { staff_id, category, amount, note, expense_date } = body;
    
    if (!staff_id) return NextResponse.json({ error: 'staff_id required' }, { status: 400 });
    if (!amount || Number(amount) <= 0) return NextResponse.json({ error: 'amount must be positive' }, { status: 400 });
    
    const { data, error } = await supabase.from('expenses').insert([
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
