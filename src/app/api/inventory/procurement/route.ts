import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { importProcurementPayload } from '@/lib/procurement';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function svc() {
  return createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET() {
  try {
    const supabase = svc();
    const [suppliers, invoices, receipts, anomalies] = await Promise.all([
      supabase.from('suppliers').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('supplier_invoices').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('goods_receipts').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('procurement_anomalies').select('*').order('created_at', { ascending: false }).limit(50),
    ]);

    return NextResponse.json({
      suppliers: suppliers.data ?? [],
      invoices: invoices.data ?? [],
      receipts: receipts.data ?? [],
      anomalies: anomalies.data ?? [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load procurement data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body?.action || 'draft');

    if (action === 'draft' || action === 'import') {
      const result = await importProcurementPayload({ ...body.payload, reviewMode: true });
      return NextResponse.json(result);
    }

    if (action === 'approve') {
      const result = await importProcurementPayload({ ...body.payload, reviewMode: false });
      return NextResponse.json(result);
    }

    if (action === 'apply') {
      const result = await importProcurementPayload({ ...body.payload, reviewMode: false });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unsupported procurement action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to process procurement request' }, { status: 500 });
  }
}
