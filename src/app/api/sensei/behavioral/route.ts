import { NextResponse } from 'next/server';
import { groqChat, parseJsonFromText } from '@/lib/groq';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const totalOrders = Number(body.totalOrders) || 0;
    const aov = Number(body.aov) || 0;
    const language = body.language === 'en' || body.language === 'ru' ? body.language : 'az';

    if (totalOrders === 0) {
      return NextResponse.json({ insights: [], summary: '' });
    }

    const text = await groqChat(
      `Restaurant analytics assistant. Language: ${language}. Reply with JSON only: {"insights":[{"title":"string","detail":"string","severity":"info"|"warning"|"critical"}],"summary":"string"}`,
      JSON.stringify({
        totalOrders,
        aov,
        peakHours: body.peakHours || [],
        orderItemsSample: (body.orderItems || []).slice(0, 30),
      }),
      { maxTokens: 700 }
    );

    const parsed = parseJsonFromText<{ insights: unknown[]; summary: string }>(text);
    return NextResponse.json(parsed || { insights: [], summary: '' });
  } catch {
    return NextResponse.json({ error: 'behavioral failed' }, { status: 500 });
  }
}
