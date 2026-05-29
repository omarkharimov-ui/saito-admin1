import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { groqChat } from '@/lib/groq';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET /api/inventory/waste-standards?q=avokado
// Groq AI ilə ingredient-in standart itki faizini tapır, DB-də cache-ləyir
export async function GET(req: Request) {
  try {
    const supabase = svc();
    const url = new URL(req.url);
    const q = url.searchParams.get('q')?.toLowerCase().trim();
    if (!q) return NextResponse.json([]);

    // 1. DB cache-də yoxla
    const { data: cached } = await supabase
      .from('waste_standards')
      .select('keyword, keyword_en, waste_percentage, note, category')
      .or(`keyword.ilike.${q},keyword_en.ilike.${q}`)
      .limit(1);

    if (cached && cached.length > 0) {
      return NextResponse.json(cached);
    }

    // 2. Tapılmadı → Groq AI soruş
    const aiResponse = await groqChat(
      `Sən professional aşpaz və qida texnoloqusansan. 
       İstifadəçi bir ingredient adı yazacaq. 
       Sən o ingredient üçün STANDART SOYUQ İTKİ faizini (0-99 arası) və səbəbini qaytarmalısan.
       
       CAVAB FORMATI (yalnız JSON, başqa heç nə):
       {"waste_percentage": 12, "note": "Qabıq + çəyirdək", "category": "meyvə", "keyword_en": "avocado"}
       
       Qaydalar:
       - Soyuq itki = təmizləmə, soyma, kəsmə itkisi (bişmə itkisi DEYİL)
       - Un, düyü, şəkər, yağ, süd, qaymaq → 0%
       - ət məhsulları 8-15% arası
       - balıq 10-20% arası
       - meyvələr 0-45% arası
       - tərəvəzlər 3-25% arası
       - Cavab yalnız JSON olmalıdır, heç bir izah əlavə etmə`,
      q,
      { temperature: 0.1, maxTokens: 200 }
    );

    // 3. AI cavabını parse et
    let parsed: any = null;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch {}

    if (!parsed || typeof parsed.waste_percentage !== 'number') {
      return NextResponse.json([{ keyword: q, waste_percentage: 0, note: 'Məlumat tapılmadı', category: null }]);
    }

    // 4. DB cache-ə yaz (next dəfə AI soruşmasın)
    await supabase.from('waste_standards').upsert({
      keyword: q,
      keyword_en: parsed.keyword_en || null,
      waste_percentage: parsed.waste_percentage,
      note: parsed.note || null,
      category: parsed.category || null,
    }).maybeSingle();

    return NextResponse.json([{
      keyword: q,
      keyword_en: parsed.keyword_en || null,
      waste_percentage: parsed.waste_percentage,
      note: parsed.note || null,
      category: parsed.category || null,
    }]);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
