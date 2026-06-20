import { NextResponse } from 'next/server';
import { groqChat, parseJsonFromText } from '@/lib/groq';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const changePercent = Number(body.changePercent) || 0;
    const currentSold = Number(body.currentSold) || 0;
    const currentPrice = Number(body.currentPrice) || 0;
    const language = body.language === 'en' || body.language === 'ru' ? body.language : 'az';

    const text = await groqChat(
      `Price elasticity analyst for a restaurant. Language: ${language}. Reply JSON only: {"projection":"string","revenueDelta":"string","risk":"low"|"medium"|"high"}`,
      JSON.stringify({
        product: body.product,
        currentPrice,
        changePercent,
        currentSold,
        totalRevenue: body.totalRevenue,
      }),
      { maxTokens: 400 }
    );

    const parsed = parseJsonFromText<{ projection: string }>(text);
    return NextResponse.json({
      projection: parsed?.projection || '',
      revenueDelta: (parsed as { revenueDelta?: string })?.revenueDelta,
      risk: (parsed as { risk?: string })?.risk,
    });
  } catch {
    return NextResponse.json({ error: 'whatif failed' }, { status: 500 });
  }
}
