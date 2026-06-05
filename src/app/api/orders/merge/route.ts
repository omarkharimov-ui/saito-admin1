import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

export async function POST(request: NextRequest) {
  try {
    const { table_numbers } = await request.json();

    if (!table_numbers || table_numbers.length < 2) {
      return NextResponse.json({ error: 'At least 2 table numbers required' }, { status: 400 });
    }

    const targetTable = table_numbers[0];
    const restTables = table_numbers.slice(1);

    const targetFilter = restTables.map((t: number) => `table_number.eq.${t}`).join(',');
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?or=(${targetFilter})&status=neq.paid`,
      {
        headers: { ...headers, 'Prefer': 'return=minimal' },
        method: 'PATCH',
        body: JSON.stringify({ table_number: targetTable }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Merge failed: ${err}` }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
