import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  return NextResponse.json({ 
    error: 'This endpoint is deprecated. PIN migration is complete.' 
  }, { status: 410 });
}
