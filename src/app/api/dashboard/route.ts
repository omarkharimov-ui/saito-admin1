import { NextResponse } from 'next/server';

// Dashboard üçün bütün məlumatları bir API call-da qaytar
// Service role key istifadə edirik (RLS-dən qaçmaq üçün)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jbxmlnsicbfkbsatnoej.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export async function GET() {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Parallel fetch all data
    const [
      productsRes,
      categoriesRes,
      ordersRes,
      campaignsRes,
      settingsRes
    ] = await Promise.all([
      // Products
      fetch(`${SUPABASE_URL}/rest/v1/products?select=*,category:categories(*),variants:product_variants(*),modifiers:product_modifiers(*)&order=name`, {
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }),
      // Categories
      fetch(`${SUPABASE_URL}/rest/v1/categories?select=*&order=name`, {
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }),
      // Paid orders for today (for AOV)
      fetch(`${SUPABASE_URL}/rest/v1/orders?select=total_amount&status=eq.paid&created_at=gte.${todayStart.toISOString()}`, {
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }),
      // Active Happy Hour
      fetch(`${SUPABASE_URL}/rest/v1/campaigns?select=id&type=eq.HAPPY_HOUR&status=eq.active&limit=1`, {
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }),
      // Settings
      fetch(`${SUPABASE_URL}/rest/v1/settings?select=opening_hours&limit=1`, {
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }),
    ]);

    // Parse responses
    const [products, categories, orders, campaigns, settings] = await Promise.all([
      productsRes.json(),
      categoriesRes.json(),
      ordersRes.json(),
      campaignsRes.json(),
      settingsRes.json(),
    ]);

    // Calculate AOV
    const todayAov = orders && orders.length > 0
      ? orders.reduce((s: number, o: any) => s + (Number(o.total_amount) || 0), 0) / orders.length
      : 0;

    return NextResponse.json({
      products: products || [],
      categories: categories || [],
      todayAov,
      isHappyHourActive: Boolean(campaigns && campaigns.length > 0),
      openingHours: settings?.[0]?.opening_hours || null,
    });

  } catch (error: any) {
    console.error('[Dashboard API] Error:', error);
    return NextResponse.json(
      { error: 'API xətası: ' + (error.message || 'Unknown error') },
      { status: 500 }
    );
  }
}
