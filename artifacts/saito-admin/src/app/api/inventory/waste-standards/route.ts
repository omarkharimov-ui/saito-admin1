import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { groqChat } from '@/lib/groq';
import { requireAuth } from '@/lib/api-auth';

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
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;

  try {
    const supabase = svc();
    const url = new URL(req.url);
    const q = url.searchParams.get('q')?.toLowerCase().trim();

    if (q) {
      // 2026-09-28 (fix): the old .or(keyword.ilike, keyword_en.ilike) 400'd
      // because the `keyword_en` column does not exist in waste_standards —
      // so the cache NEVER hit and every lookup hit the AI path. The table
      // only has: id, keyword, waste_percentage, category, created_at.
      const { data: cached } = await supabase
        .from('waste_standards')
        .select('*')
        .ilike('keyword', q)
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

       // 13a (E2E r26 S8): the table only has (id, keyword, waste_percentage,
       // category, created_at) — the old upsert sent keyword_en + note and
       // silently failed (no error check), so the AI cache NEVER persisted.
       const up = await supabase.from('waste_standards').upsert({
         keyword: q,
         waste_percentage: parsed.waste_percentage,
         category: parsed.category || null,
       }).maybeSingle();
       if (up.error) console.error('[waste-standards] AI cache upsert failed:', up.error.message);

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
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;

  try {
    const supabase = svc();
    const body = await req.json();
    const { keyword, waste_percentage, category } = body;
    // 13a (E2E r26 S8): keyword_en + note do NOT exist in the table — the
    // old insert 500'd ("Could not find the 'keyword_en' column ... schema
    // cache"), i.e. the page's create form was hard-broken.

    if (!keyword || waste_percentage === undefined) {
      return NextResponse.json({ error: 'keyword və waste_percentage tələb olunur' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('waste_standards')
      .insert({ keyword: keyword.toLowerCase().trim(), waste_percentage, category: category ?? null })
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
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;

  try {
    const supabase = svc();
    const body = await req.json();
    const { id, keyword, waste_percentage, category } = body;
    // 13a (E2E r26 S8): same phantom columns (keyword_en/note/updated_at
    // don't exist) — PATCH 500'd on every save.

    if (!id) {
      return NextResponse.json({ error: 'id tələb olunur' }, { status: 400 });
    }

    const updates: any = {};
    if (keyword !== undefined) updates.keyword = keyword.toLowerCase().trim();
    if (waste_percentage !== undefined) updates.waste_percentage = waste_percentage;
    if (category !== undefined) updates.category = category;

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
  const auth = await requireAuth();
  if (!auth.authenticated) return auth;

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
