import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
};

export async function GET() {
  try {
    const [combosRes, productsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/combos?select=*,items:combo_items(*,product:products(*))&order=created_at.desc`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/products?select=id,name,price,image_url&order=name`, { headers }),
    ]);

    const [combos, products] = await Promise.all([
      combosRes.json(),
      productsRes.json(),
    ]);

    return NextResponse.json({
      combos: combos || [],
      products: products || [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, data, id } = body;

    let url = `${SUPABASE_URL}/rest/v1/combos`;
    let method = 'POST';

    if (action === 'update') {
      url += `?id=eq.${id}`;
      method = 'PATCH';
    } else if (action === 'delete') {
      url += `?id=eq.${id}`;
      method = 'DELETE';
    }

    const res = await fetch(url, {
      method,
      headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: action !== 'delete' ? JSON.stringify(data) : undefined,
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT — combo edit (frontend PUT ile gonderir)
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, data } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 });
    }

    const url = `${SUPABASE_URL}/rest/v1/combos?id=eq.${id}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const result = await res.json();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
