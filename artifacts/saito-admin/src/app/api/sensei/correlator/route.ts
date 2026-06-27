import { NextResponse } from 'next/server';
import { groqChat, parseJsonFromText } from '@/lib/groq';
import { validateAuth } from '@/lib/api-auth';

export async function POST(request: Request) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const language = body.language === 'en' || body.language === 'ru' ? body.language : 'az';

    const text = await groqChat(
      `Restaurant revenue correlator. Language: ${language}. Reply JSON only: {"factors":[{"label":"string","impact":"high"|"medium"|"low","note":"string"}],"weatherNote":"string","recommendation":"string"}`,
      JSON.stringify({
        totalOrders: body.totalOrders,
        totalRevenue: body.totalRevenue,
        aov: body.aov,
        peakHours: body.peakHours,
        chartData: (body.chartData || []).slice(-14),
        categoryPerformance: (body.categoryPerformance || []).slice(0, 8),
        city: body.city || 'Baku',
      }),
      { maxTokens: 700 }
    );

    const parsed = parseJsonFromText<Record<string, unknown>>(text);
    return NextResponse.json(parsed || { factors: [], weatherNote: '', recommendation: '' });
  } catch {
    return NextResponse.json({ error: 'correlator failed' }, { status: 500 });
  }
}
