import { NextResponse } from 'next/server';

function getHeaders() {
  return {
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`,
    'Content-Type': 'application/json',
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { customer_name, phone, date, time, guests, notes } = body;

    if (!customer_name || !phone || !date || !time || !guests) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const h = getHeaders();
    const checkRes = await fetch(
      `${supabaseUrl}/rest/v1/reservations?select=id&phone=eq.${phone}&date=eq.${date}&time=eq.${time}`,
      { headers: h }
    );
    const existing = await checkRes.json();
    if (existing && existing.length > 0) {
      return NextResponse.json({ error: 'A reservation already exists for this time and phone number.' }, { status: 409 });
    }

    const res = await fetch(`${supabaseUrl}/rest/v1/reservations`, {
      method: 'POST',
      headers: { ...h, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        customer_name,
        name: customer_name, // Sync name and customer_name for compatibility
        phone,
        date,
        time,
        guests: parseInt(guests),
        notes,
        status: 'pending', // Default status for public reservations
        created_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Supabase error: ${error}`);
    }

    const result = await res.json();
    return NextResponse.json({ success: true, data: result[0] });

  } catch (error: any) {
    console.error('[Public Reservation API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
