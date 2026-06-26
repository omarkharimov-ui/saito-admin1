import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { canTransitionInvoice } from '@/types/inventory';
import type { InvoiceStatus } from '@/types/inventory';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = svc();

    const { data: invoice } = await supabase
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('id', id)
      .single();

    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    return NextResponse.json(invoice);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(['admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { id } = await params;
    const supabase = svc();
    const body = await request.json();

    if (body.status) {
      const { data: current } = await supabase
        .from('invoices')
        .select('status')
        .eq('id', id)
        .single();
      if (current && !canTransitionInvoice(current.status as InvoiceStatus, body.status)) {
        return NextResponse.json({
          error: `Cannot transition from "${current.status}" to "${body.status}"`,
          validTransitions: ['draft', 'matched', 'needs_review', 'approved', 'applied', 'rejected', 'rolled_back', 'partially_applied'],
        }, { status: 409 });
      }
    }

    const allowedFields = ['status', 'notes', 'due_date', 'invoice_date', 'invoice_number'];
    const update: Record<string, any> = {};
    for (const key of allowedFields) {
      if (key in body) update[key] = body[key];
    }

    const { error } = await supabase.from('invoices').update(update).eq('id', id);
    if (error) throw error;

    const { data: invoice } = await supabase
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('id', id)
      .single();

    return NextResponse.json(invoice);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = svc();

    await supabase.from('invoice_items').delete().eq('invoice_id', id);
    const { error } = await supabase.from('invoices').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
