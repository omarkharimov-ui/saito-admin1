import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { groqChat } from '@/lib/groq';
import { validateAuth } from '@/lib/api-auth';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET /api/inventory/waste-standards — all
// GET /api/inventory/waste-standards?q=avokado — AI lookup with cache
export async function GET(req: Request) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = svc();
    const url = new URL(req.url);
    const q = url.searchParams.get('q')?.toLowerCase().trim();

    if (q) {
      const { data: cached } = await supabase
        .from('waste_standards')
        .select('*')
        .or(`keyword.ilike.${q},keyword_en.ilike.${q}`)
        .limit(1);

      if (cached && cached.length > 0) {
        return NextResponse.json(cached);
      }

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

      let parsed: any = null;
      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch {}

      if (!parsed || typeof parsed.waste_percentage !== 'number') {
        return NextResponse.json([{ keyword: q, waste_percentage: 0, note: 'Məlumat tapılmadı', category: null }]);
      }

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
    }

    const { data, error } = await supabase
      .from('waste_standards')
      .select('*')
      .order('keyword');

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = svc();
    const body = await req.json();
    const { keyword, keyword_en, waste_percentage, note, category } = body;

    if (!keyword || waste_percentage === undefined) {
      return NextResponse.json({ error: 'keyword və waste_percentage tələb olunur' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('waste_standards')
      .insert({ keyword: keyword.toLowerCase().trim(), keyword_en, waste_percentage, note, category })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Bu keyword artıq mövcuddur' }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = svc();
    const body = await req.json();
    const { id, keyword, keyword_en, waste_percentage, note, category } = body;

    if (!id) {
      return NextResponse.json({ error: 'id tələb olunur' }, { status: 400 });
    }

    const updates: any = {};
    if (keyword !== undefined) updates.keyword = keyword.toLowerCase().trim();
    if (keyword_en !== undefined) updates.keyword_en = keyword_en;
    if (waste_percentage !== undefined) updates.waste_percentage = waste_percentage;
    if (note !== undefined) updates.note = note;
    if (category !== undefined) updates.category = category;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('waste_standards')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const supabase = svc();
    const url = new URL(req.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id tələb olunur' }, { status: 400 });
    }

    const { error } = await supabase.from('waste_standards').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
