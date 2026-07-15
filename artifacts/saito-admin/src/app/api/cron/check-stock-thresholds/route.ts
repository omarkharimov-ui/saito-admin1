import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase.rpc('check_stock_thresholds');

    if (error) {
      console.error('[cron/check-stock-thresholds] RPC failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const lowStockItems = data || [];

    if (lowStockItems.length === 0) {
      return NextResponse.json({ low_stock_count: 0, items: [], notifications_created: 0 });
    }

    const supplierMap = new Map<string, { name: string; phone: string; whatsapp_number: string; items: any[] }>();

    for (const item of lowStockItems) {
      const supplierId = item.supplier_id;
      if (!supplierId) continue;

      if (!supplierMap.has(supplierId)) {
        const { data: supplier } = await supabase
          .from('suppliers')
          .select('id, name, phone, whatsapp_number')
          .eq('id', supplierId)
          .single();

        if (supplier?.whatsapp_number) {
          supplierMap.set(supplierId, { name: supplier.name, phone: supplier.phone || '', whatsapp_number: supplier.whatsapp_number, items: [] });
        }
      }

      const group = supplierMap.get(supplierId);
      if (group) {
        group.items.push(item);
      }
    }

    let notificationsCreated = 0;

    for (const [supplierId, group] of supplierMap.entries()) {
      const itemList = group.items.map(i => `• ${i.name}: ${i.current_stock} ${i.unit} (minimum: ${i.min_stock_level || 0} ${i.unit})`).join('\n');
      const message = `Salam ${group.name},\n\nAşağıdakı xammalların təchizatı lazımdır:\n\n${itemList}\n\nZəhmət olmasa tezliklə təchiz edin.\n\nTəşəkkürlər!`;
      const cleanPhone = group.whatsapp_number.replace(/[^0-9]/g, '');
      const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

      const { error: notifError } = await supabase.from('notifications').insert({
        type: 'supplier_auto_order',
        title: `Avto-sifariş: ${group.name}`,
        body: `${group.items.length} xammal üçün avto-sifariş hazırlandı`,
        data: {
          supplier_id: supplierId,
          supplier_name: group.name,
          whatsapp_number: cleanPhone,
          whatsapp_url: waUrl,
          message,
          items: group.items,
        },
      });

      if (notifError) {
        console.error('[cron/check-stock-thresholds] notification failed:', notifError);
      } else {
        notificationsCreated++;
      }
    }

    return NextResponse.json({ low_stock_count: lowStockItems.length, items: lowStockItems, notifications_created: notificationsCreated });
  } catch (err) {
    console.error('[cron/check-stock-thresholds] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
