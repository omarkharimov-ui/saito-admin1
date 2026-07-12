import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
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
  try {
    const body = await req.json();
    const { staff_id, category, amount, note, expense_date } = body;
    
    const { data, error } = await supabase.from('expenses').insert([
      {
        staff_id: staff_id || null,
        category: category || 'salary',
        amount: Number(amount) || 0,
        note: note || '',
        expense_date: expense_date || new Date().toISOString().split('T')[0],
      }
    ]).select().single();
    
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
