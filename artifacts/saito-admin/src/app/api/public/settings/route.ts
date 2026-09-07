import { NextResponse } from 'next/server';
import { fetchSettingsRow } from '@/lib/settings-svc';

// Public-safe footer info only. Never expose operational/payment/printer/AI
// or legacy secret fields here.
const PUBLIC_COLS = [
  'restaurant_name',
  'address',
  'phone',
  'city',
  'instagram_url',
  'whatsapp_number',
  'footer_text',
  'contact_email',
];

export async function GET() {
  try {
    const row = await fetchSettingsRow(PUBLIC_COLS);
    return NextResponse.json(
      { settings: row },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
