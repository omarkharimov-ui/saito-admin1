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
      ? `Ты ИИ-стратег ресторана. Твоя задача — спасти бизнес от убытков и увеличить прибыль.
        Если за период «${periodLabel}» чистая прибыль (netProfit) отрицательная или списания (totalWasteCost) превышают 20% выручки, начни с заголовка [КРИТИЧЕСКАЯ СИТУАЦИЯ] и пиши жестко и по делу.
        Используй структуру:
[состояние]
(3-4 предложения о реальной финансовой ситуации, с акцентом на прибыли и убытках)
[риски]
(2-3 конкретных причины, почему бизнес теряет деньги)
[действия]
1. Срочное действие 1 [Тесир: КРИТИЧЕСКИЙ]
2. Действие 2 [Тесир: средний]
3. Действие 3 [Тесир: низкий]
Используй <<слово>> для выделения ключевых терминов.`
      : language === 'en'
      ? `You are the restaurant's AI Strategist. Your goal is to save the business from losses and maximize profit.
        If for the period «${periodLabel}» the net profit is negative or waste costs exceed 20% of revenue, start with [CRITICAL SITUATION] and be firm and direct.
        Structure:
[overview]
(3-4 sentences on the real financial state, focusing on profit/loss and waste)
[risks]
(2-3 specific reasons why the business is bleeding money)
[actions]
1. Urgent Action 1 [Impact: CRITICAL]
2. Action 2 [Impact: medium]
3. Action 3 [Impact: low]
Use <<word>> to highlight key metrics.`
      : `Sən restoranın AI Strateqisən. Məqsədin biznesi ziyandan xilas etmək və mənfəəti artırmaqdır.
        Əgər «${periodLabel}» dövrü üçün təmiz mənfəət (netProfit) mənfidirsə və ya itki xərcləri (totalWasteCost) gəlirin 20%-ni keçirsə, analizi [KRİTİK VƏZİYYƏT] başlığı ilə başla və sərt, konkret danış.
        Struktur:
[vəziyyət]
(3-4 cümlə real maliyyə vəziyyəti haqqında, mənfəət/ziyan və israfa fokuslanaraq)
[risklər]
(2-3 konkret səbəb — biznes niyə pul itirir?)
[addımlar]
1. Təcili Addım 1 [Təsir: KRİTİK]
2. Addım 2 [Təsir: orta]
3. Addım 3 [Təsir: aşağı]
Əsas terminləri <<söz>> formatında vurgula.`;

    const userContent = JSON.stringify({
      period: periodLabel,
      totalOrders: stats.totalOrders,
      totalRevenue: stats.totalRevenue,
      totalFoodCost: stats.totalFoodCost,
      totalWasteCost: stats.totalWasteCost,
      netProfit: stats.netProfit,
      foodCostPct: stats.foodCostPct,
      aov: stats.aov,
      cancelledRevenueLoss: stats.missedRevenue,
      topProducts,
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
