import { NextResponse } from 'next/server';
import { groqChat } from '@/lib/groq';
import { validateAuth } from '@/lib/api-auth';

export async function POST(request: Request) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { message, stats } = body;
    const language: string = body.language === 'en' || body.language === 'ru' ? body.language : 'az';

    if (!message) {
      return NextResponse.json({ reply: '' });
    }

    const systemPrompt = language === 'ru'
      ? `Ты — Sensei, ИИ-помощник ресторана. Отвечай кратко и по делу. Используй эмодзи умеренно. Не пиши длинных анализов. Отвечай на языке пользователя.`
      : language === 'en'
      ? `You are Sensei, a restaurant AI assistant. Answer briefly and to the point. Use emoji sparingly. Don't write long analyses. Answer in the user's language.`
      : `Sən Sensei, restoran AI köməkçisən. Qısa və konkret cavab ver. Emojiləri az istifadə et. Uzun analizlər yazma. İstifadəçinin dilində cavab ver.`;

    const context = stats
      ? `Current stats: ${JSON.stringify({ totalRevenue: stats.totalRevenue, totalOrders: stats.totalOrders, aov: stats.aov })}`
      : '';

    const text = await groqChat(systemPrompt, `${context}\n\nUser: ${message}`, { maxTokens: 500, temperature: 0.7 });

    if (!text) {
      return NextResponse.json({ reply: '...' });
    }

    return NextResponse.json({ reply: text.trim() });
  } catch {
    return NextResponse.json({ error: 'Chat failed' }, { status: 500 });
  }
}
