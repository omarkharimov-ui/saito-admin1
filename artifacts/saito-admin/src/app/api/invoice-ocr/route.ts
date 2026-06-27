import { NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

const GROQ_API_KEY = process.env.GROQ_API_KEY;

export async function POST(request: Request) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { imageUrl, language } = await request.json();

    if (!GROQ_API_KEY) {
      return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 });
    }

    const base64Image = imageUrl.replace(/^data:image\/\w+;base64,/, '');

    const prompt = `You are an invoice OCR system. Analyze this invoice/purchase receipt image and extract line items.
Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "supplierName": "Supplier name or null",
  "invoiceNumber": "Invoice number or null",
  "totalAmount": 0.00,
  "lines": [
    {
      "name": "Product name",
      "quantity": 1,
      "unit": "kg|g|l|ml|pcs|piece|box|bag",
      "unit_cost": 0.00,
      "total_cost": 0.00,
      "waste_percentage": null
    }
  ]
}

Rules:
- Extract EVERY line item from the invoice
- quantity must be a number (default 1 if not clear)
- unit defaults to "pcs" if not specified
- unit_cost is price per unit, total_cost is line total
- waste_percentage is always null for invoice imports
- If you can't determine exact values, make your best guess
- supplierName can be extracted from the header/footer of the invoice
- totalAmount is the grand total`;

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
        max_tokens: 2000,
        temperature: 0.1,
      }),
    });

    if (!groqRes.ok) {
      const errorText = await groqRes.text();
      console.error('[InvoiceOCR] Groq error:', groqRes.status, errorText);
      return NextResponse.json({ error: 'OCR analysis failed' }, { status: 500 });
    }

    const groqData = await groqRes.json();
    const content = groqData.choices?.[0]?.message?.content || '';

    let result;
    try {
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) ||
                         content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      result = JSON.parse(jsonStr);
    } catch {
      result = {
        supplierName: null,
        invoiceNumber: null,
        totalAmount: null,
        lines: [{ name: 'Məhsul', quantity: 1, unit: 'pcs', unit_cost: null, total_cost: null, waste_percentage: null }],
      };
    }

    if (!Array.isArray(result.lines) || result.lines.length === 0) {
      result.lines = [{ name: 'Məhsul', quantity: 1, unit: 'pcs', unit_cost: null, total_cost: null, waste_percentage: null }];
    }

    return NextResponse.json(result);
  } catch (e: any) {
    console.error('[InvoiceOCR] Error:', e.message);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
