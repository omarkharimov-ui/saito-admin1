import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const GROQ_API_KEY = process.env.GROQ_API_KEY;

export async function POST(request: NextRequest) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { productName } = await request.json();
    if (!productName) {
      return NextResponse.json({ error: 'productName required' }, { status: 400 });
    }

    const supabase = svc();

    const { data: ingredients } = await supabase
      .from('ingredients')
      .select('id, name, unit')
      .order('name');

    if (!ingredients?.length) {
      return NextResponse.json({ match: null, candidates: [] });
    }

    if (!GROQ_API_KEY) {
      const direct = ingredients.find(i => i.name.toLowerCase() === productName.toLowerCase());
      if (direct) {
        return NextResponse.json({ match: { ...direct, confidence: 1 }, candidates: [] });
      }
      const fuzzy = ingredients
        .map(i => {
          const score = i.name.toLowerCase().includes(productName.toLowerCase()) ||
                        productName.toLowerCase().includes(i.name.toLowerCase()) ? 0.5 : 0;
          return { ...i, confidence: score };
        })
        .filter(i => i.confidence > 0)
        .sort((a, b) => b.confidence - a.confidence);
      return NextResponse.json({ match: fuzzy[0] || null, candidates: fuzzy.slice(0, 5) });
    }

    const ingredientList = ingredients.map(i => `${i.name} (${i.unit})`).join(', ');

    const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{
          role: 'system',
          content: `You are an ingredient matching AI. Match the given product name to the most appropriate ingredient from this list. Return JSON: { "match": { "id": "...", "name": "...", "confidence": 0.95 }, "candidates": [{ "id": "...", "name": "...", "confidence": 0.5 }] }. Confidence 0-1. If no match, return match: null. Ingredients: ${ingredientList}`,
        }, {
          role: 'user',
          content: `Match this product to the closest ingredient: "${productName}"`,
        }],
        temperature: 0.1,
        max_tokens: 300,
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      return NextResponse.json({ error: text }, { status: 500 });
    }

    const aiData = await aiRes.json();
    let result;
    try {
      const content = aiData.choices?.[0]?.message?.content || '{}';
      const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      result = JSON.parse(cleaned);
    } catch {
      result = { match: null, candidates: [] };
    }

    if (result.match?.id) {
      const dbIngredient = ingredients.find(i => i.id === result.match.id);
      if (dbIngredient) {
        result.match.name = dbIngredient.name;
        result.match.unit = dbIngredient.unit;
      }
    }

    if (result.candidates?.length) {
      result.candidates = result.candidates.map((c: any) => {
        const db = ingredients.find(i => i.id === c.id);
        if (db) { c.name = db.name; c.unit = db.unit; }
        return c;
      }).filter((c: any) => c.name);
    }

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
