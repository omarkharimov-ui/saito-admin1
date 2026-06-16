import { NextResponse } from 'next/server';
import { buildProcurementIntelligence } from '@/lib/procurement-intelligence';

export async function GET() {
  try {
    const intelligence = await buildProcurementIntelligence();
    return NextResponse.json(intelligence);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load procurement intelligence' }, { status: 500 });
  }
}
