import { NextResponse } from 'next/server';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function groqTranslate(text: string, targetLang: string): Promise<string> {
  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: `You are a professional food menu translator. Translate to ${targetLang}. Return ONLY the translation, no explanations or extra text.` },
        { role: 'user', content: text },
      ],
      temperature: 0.2,
      max_tokens: 300,
    }),
  });
  if (!res.ok) return '';
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!GROQ_API_KEY) return NextResponse.json({});

    // detectOnly mode — detect language of text
    if (body.detectOnly) {
      const text: string = body.text || '';
      if (!text.trim()) return NextResponse.json({ detectedLanguage: 'az' });
      try {
        const res = await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: 'Detect the language of the text. Reply with only one of: az, en, ru, or other.' },
              { role: 'user', content: text },
            ],
            temperature: 0,
            max_tokens: 5,
          }),
        });
        if (res.ok) {
          const d = await res.json();
          const raw = (d.choices?.[0]?.message?.content || '').trim().toLowerCase();
          const lang = ['az', 'en', 'ru'].find(l => raw.includes(l)) || 'other';
          return NextResponse.json({ detectedLanguage: lang });
        }
      } catch { /* silent */ }
      return NextResponse.json({ detectedLanguage: 'az' });
    }

    // Translation mode
    const fields: Record<string, string> = body.fields || {};
    const languages: string[] = body.languages || [];

    const fieldEntries = Object.entries(fields).filter(([, v]) => v && typeof v === 'string' && v.trim());
    if (fieldEntries.length === 0 || languages.length === 0) return NextResponse.json({ result: {} });

    // Parallel translate: all fields × all langs simultaneously
    const tasks = languages.flatMap(lang =>
      fieldEntries.map(async ([key, value]) => {
        try {
          const translated = await groqTranslate(value, lang);
          return { lang, key, translated };
        } catch {
          return { lang, key, translated: '' };
        }
      })
    );

    const settled = await Promise.all(tasks);

    // Build result: { Azerbaijani: { name: '...', description: '...' }, English: {...}, Russian: {...} }
    const result: Record<string, Record<string, string>> = {};
    for (const { lang, key, translated } of settled) {
      if (!translated) continue;
      if (!result[lang]) result[lang] = {};
      result[lang][key] = translated;
    }

    return NextResponse.json({ result });
  } catch {
    return NextResponse.json({ result: {} });
  }
}
