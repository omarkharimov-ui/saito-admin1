import { NextResponse } from 'next/server';

const GROQ_API_KEY = process.env.GROQ_API_KEY;

export async function POST(request: Request) {
  try {
    const { imageUrl, language } = await request.json();
    
    console.log('[Vision API] Received request, language:', language);
    console.log('[Vision API] Image URL length:', imageUrl?.length || 0);
    
    if (!GROQ_API_KEY) {
      console.error('[Vision API] GROQ_API_KEY not configured');
      return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 });
    }

    // Remove base64 prefix if present
    const base64Image = imageUrl.replace(/^data:image\/\w+;base64,/, '');

    const prompt = language === 'az'
      ? `Bu şəkildəki yemək/məhsulu təhlil et və yalnız JSON formatında cavab ver (başqa heç nə yazma):
{"name":"Məhsulun adı (Azərbaycan dilində, qısa və cəlbedici)","description":"Məhsulun təsviri (Azərbaycan dilində, 80-100 simvol)","ingredients":"Tərkibindəkilər (Azərbaycan dilində, vergüllə ayrılmış)"}`
      : language === 'ru'
      ? `Проанализируй еду/продукт на фото и ответь ТОЛЬКО в формате JSON (ничего лишнего):
{"name":"Название продукта (на русском, коротко и привлекательно)","description":"Описание продукта (на русском, 80-100 символов)","ingredients":"Ингредиенты (на русском, через запятую)"}`
      : `Analyze this food/product image and respond ONLY in JSON format (nothing else):
{"name":"Product name (short and catchy)","description":"Product description (80-100 characters)","ingredients":"Ingredients (comma separated)"}`;


    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { 
                type: 'image_url', 
                image_url: { url: `data:image/jpeg;base64,${base64Image}` } 
              }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!groqRes.ok) {
      const errorText = await groqRes.text();
      console.error('[Vision API] Groq error status:', groqRes.status, errorText);
      return NextResponse.json({ error: 'Vision analysis failed', detail: errorText }, { status: 500 });
    }

    const groqData = await groqRes.json();
    const content = groqData.choices?.[0]?.message?.content || '';

    // Parse JSON from response
    let result;
    try {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || 
                         content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : content;
      result = JSON.parse(jsonStr);
    } catch {
      // Fallback: return raw content
      result = { 
        name: content.split('\n')[0]?.slice(0, 50) || 'Unknown',
        description: content.slice(0, 100),
        ingredients: ''
      };
    }

    return NextResponse.json({
      name: result.name || '',
      description: result.description || '',
      ingredients: result.ingredients || '',
    });

  } catch (e: any) {
    console.error('[Vision API] Error:', e.message);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
