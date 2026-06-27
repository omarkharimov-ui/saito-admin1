import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

export type StockTransactionType = 'manual_entry' | 'sale' | 'waste';

export interface CreateTransactionPayload {
  ingredientId: string;
  quantity: number;       // müsbət = giriş (+5), mənfi = çıxış (-2)
  type: StockTransactionType;
  description?: string;
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET /api/stock/transactions?ingredientId=xxx
export async function GET(req: NextRequest) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = getServiceClient();
    const ingredientId = req.nextUrl.searchParams.get('ingredientId');

    let query = supabase
      .from('stock_transactions')
      .select('*, ingredient:ingredients(name, unit)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (ingredientId) query = query.eq('ingredient_id', ingredientId);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/stock/transactions
export async function POST(req: NextRequest) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = getServiceClient();
    const body: CreateTransactionPayload = await req.json();

    const { ingredientId, quantity, type, description } = body;

    if (!ingredientId || quantity === undefined || !type) {
      return NextResponse.json(
        { error: 'ingredientId, quantity and type are required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('stock_transactions')
      .insert({
        ingredient_id: ingredientId,
        quantity,
        type,
        description: description ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
