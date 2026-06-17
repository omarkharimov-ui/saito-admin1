import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  return forward(request, 'POST');
}

async function forward(request: NextRequest, method: string) {
  const body = await request.json();
  const { ids, status, suggested_ingredient_id, notes } = body;

  if (!ids?.length) {
    return NextResponse.json({ error: 'ids array required' }, { status: 400 });
  }

  const mainUrl = new URL(request.url);
  mainUrl.pathname = '/api/procurement/reviews';

  const res = await fetch(mainUrl.toString(), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, status, suggested_ingredient_id, notes }),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
