import { NextResponse } from 'next/server';
import { groqChat } from '@/lib/groq';
import { createClient } from '@supabase/supabase-js';
import { validateAuth } from '@/lib/api-auth';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(request: Request) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const language = searchParams.get('lang') || 'az';
    const supabase = svc();

    // Son 24 saatın qısa xülasəsini götürək ki, AI ona uyğun təklif versin
    const { data: stats } = await supabase
      .from('orders')
      .select('total_amount, created_at')
      .gte('created_at', new Date(Date.now() - 86400000).toISOString());

    const totalRevenue = stats?.reduce((acc, curr) => acc + (curr.total_amount || 0), 0) || 0;
    
    // Task 4: Add more real data context
    const { count: stockAlerts } = await supabase.from('ingredients').select('*', { count: 'exact', head: true }).filter('current_stock', 'lt', 'critical_limit');

    const systemPrompt = `Sən restoranın strateji data analitiksisən. Verilən real rəqəmlərə əsasən (Gəlir, Stok və s.) ÇOX QISA və konkret bir "Günün Məsləhəti" ver. 
    Ümumi və saxta pozitiv sözlərdən qaçın. Əgər vəziyyət pisdirsə, birbaşa de.
    Dil: ${language}. Format: Qısa başlıq və maks 2 cümləlik analiz.`;

    const userPrompt = `Son 24 saatın gəliri: ${totalRevenue} AZN. Kritik stok sayı (limit altı): ${stockAlerts || 0}. Bu dürüst məlumatları nəzərə alaraq strateji bir tövsiyə ver.`;

    const tip = await groqChat(systemPrompt, userPrompt, { temperature: 0.8, maxTokens: 300 });

    return NextResponse.json({ tip: tip.trim() });
  } catch (error) {
    return NextResponse.json({ error: 'Daily tip generation failed' }, { status: 500 });
  }
}
