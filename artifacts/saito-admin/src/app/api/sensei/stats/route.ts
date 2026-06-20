import { NextResponse } from 'next/server';
import { groqChat } from '@/lib/groq';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { stats, timeFilter } = body;
    const language: string = body.language === 'en' || body.language === 'ru' ? body.language : 'az';

    if (!stats || stats.totalOrders === 0) {
      const empty =
        language === 'ru' ? '[состояние]\nДанных за этот период нет.\n[риски]\nНет данных для анализа.\n[действия]\n1. Начните принимать заказы для получения аналитики. [Тесир: ашагы]'
        : language === 'en' ? '[overview]\nNo data for this period.\n[risks]\nNo data to analyze.\n[actions]\n1. Start accepting orders to generate analytics. [Impact: low]'
        : '[vəziyyət]\nBu dövr üçün məlumat yoxdur.\n[risklər]\nAnaliz üçün məlumat mövcud deyil.\n[addımlar]\n1. Analitika üçün sifariş qəbul etməyə başlayın. [Təsir: aşağı]';
      return NextResponse.json({ analysis: empty });
    }

    const periodLabel =
      timeFilter === 'today' ? (language === 'az' ? 'bu gün' : language === 'ru' ? 'сегодня' : 'today')
      : timeFilter === 'week' ? (language === 'az' ? 'bu həftə' : language === 'ru' ? 'эта неделя' : 'this week')
      : timeFilter === 'month' ? (language === 'az' ? 'bu ay' : language === 'ru' ? 'этот месяц' : 'this month')
      : timeFilter === '3months' ? (language === 'az' ? 'son 3 ay' : language === 'ru' ? 'последние 3 месяца' : 'last 3 months')
      : timeFilter === 'year' ? (language === 'az' ? 'bu il' : language === 'ru' ? 'этот год' : 'this year')
      : timeFilter;

    const topProducts = (stats.productPerformance || [])
      .slice(0, 5)
      .map((p: { name: string; sold: number; revenue: number }) => `${p.name}: ${p.sold} sold, ₼${p.revenue?.toFixed(1)}`)
      .join('; ');

    const topCategories = (stats.categoryPerformance || [])
      .slice(0, 4)
      .map((c: { name: string; totalRevenue: number; count: number }) => `${c.name}: ₼${c.totalRevenue?.toFixed(1)}, ${c.count} orders`)
      .join('; ');

    const peakHour = (stats.peakHours || []).sort((a: { count: number }, b: { count: number }) => b.count - a.count)[0];

    const systemPrompt = language === 'ru'
      ? `Ты аналитик ресторана. Дай глубокий анализ данных за период «${periodLabel}». Используй структуру:
[состояние]
(3-4 предложения о общей ситуации, выручке, трендах — с конкретными цифрами)
[риски]
(2-3 конкретных риска или слабых места)
[действия]
1. Действие 1 [Тесир: высокий]
2. Действие 2 [Тесир: средний]
3. Действие 3 [Тесир: низкий]
Используй <<слово>> для выделения ключевых слов. Только структуру выше, без лишнего текста.`
      : language === 'en'
      ? `You are a restaurant analytics expert. Give a deep analysis for the period «${periodLabel}». Use this structure:
[overview]
(3-4 sentences about overall situation, revenue, trends — with specific numbers)
[risks]
(2-3 specific risks or weak points)
[actions]
1. Action 1 [Impact: high]
2. Action 2 [Impact: medium]
3. Action 3 [Impact: low]
Use <<word>> to highlight key terms. Only the structure above, no extra text.`
      : `Sən restoran analitiki mütəxəssisisisnən. «${periodLabel}» dövrünün dərin analizini ver. Bu strukturu istifadə et:
[vəziyyət]
(3-4 cümlə — ümumi vəziyyət, gəlir, trendlər, konkret rəqəmlərlə)
[risklər]
(2-3 konkret risk və ya zəif nöqtə)
[addımlar]
1. Addım 1 [Təsir: yüksək]
2. Addım 2 [Təsir: orta]
3. Addım 3 [Təsir: aşağı]
Əsas sözləri <<söz>> formatında vurgula. Yalnız yuxarıdakı struktur, əlavə mətn olmadan.`;

    const userContent = JSON.stringify({
      period: periodLabel,
      totalOrders: stats.totalOrders,
      totalRevenue: stats.totalRevenue,
      aov: stats.aov,
      cancelledRevenueLoss: stats.cancelledRevenueLoss,
      topProducts,
      topCategories,
      peakHour: peakHour ? `${peakHour.hour}:00 (${peakHour.count} orders)` : 'N/A',
      chartTrend: (stats.chartData || []).slice(-7).map((d: { date: string; revenue: number }) => `${d.date}: ₼${d.revenue?.toFixed(1)}`).join(', '),
    });

    const text = await groqChat(systemPrompt, userContent, { maxTokens: 900, temperature: 0.55 });

    if (!text) {
      return NextResponse.json({ error: 'AI unavailable' }, { status: 503 });
    }

    return NextResponse.json({ analysis: text.trim() });
  } catch {
    return NextResponse.json({ error: 'Stats sensei failed' }, { status: 500 });
  }
}
