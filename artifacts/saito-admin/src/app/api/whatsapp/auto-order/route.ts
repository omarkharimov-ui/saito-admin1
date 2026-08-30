import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const { supplierId, supplierName, whatsappNumber, autoOrderTemplate } = await request.json();

    if (!whatsappNumber) {
      return NextResponse.json({ error: 'WhatsApp number is required' }, { status: 400 });
    }

    const s = svc();

    // Fetch low stock ingredients for this supplier
    const ingredientsRes = await fetch(`${s.url}/rest/v1/ingredients?select=id,name,current_stock,unit,average_cost_per_unit,min_stock_level&order=current_stock.asc`, { headers: s.headers });
    const ingredients = await ingredientsRes.json();

    const lowStock = (ingredients || []).filter((ing: any) => ing.current_stock <= (ing.min_stock_level || 0));

    let message = '';
    if (autoOrderTemplate) {
      message = autoOrderTemplate;
    } else if (supplierName) {
      message = `Salam ${supplierName},\n\nAşağıdakı xammalların təchizatı lazımdır:\n\n`;
      for (const item of lowStock) {
        message += `• ${item.name}: ${item.current_stock} ${item.unit} (minimum: ${item.min_stock_level || 0} ${item.unit})\n`;
      }
      message += `\nZəhmət olmasa tezliklə təchiz edin.\n\nTəşəkkürlər!`;
    } else {
      message = 'Salam, stok hazırlanması haqqında məlumat verərmi?';
    }

    const cleanPhone = whatsappNumber.replace(/[^0-9]/g, '');
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

    return NextResponse.json({
      success: true,
      url: waUrl,
      message,
      lowStockItems: lowStock.length,
      items: lowStock,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
