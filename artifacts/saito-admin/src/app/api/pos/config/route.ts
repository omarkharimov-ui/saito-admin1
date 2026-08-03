import { NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

export const runtime = 'edge';

export async function GET() {
  const auth = await validateAuth();
  if (!auth.authenticated) return NextResponse.json({ error: auth.error }, { status: auth.status });

  return NextResponse.json({
    modes: {
      dine_in: {
        label: 'İçəridə',
        icon: 'Utensils',
        requiresTable: true,
        allowsTableOps: true,
        allowsReservation: true,
        requiresCustomer: false,
        requiresAddress: false,
        requiresPhone: false,
        fields: ['table_number', 'guest_count'],
      },
      takeaway: {
        label: 'Götür',
        icon: 'Package',
        requiresTable: false,
        allowsTableOps: false,
        allowsReservation: false,
        requiresCustomer: false,
        requiresAddress: false,
        requiresPhone: true,
        fields: ['customer_phone'],
      },
      delivery: {
        label: 'Çatdır',
        icon: 'Car',
        requiresTable: false,
        allowsTableOps: false,
        allowsReservation: false,
        requiresCustomer: true,
        requiresAddress: true,
        requiresPhone: true,
        fields: ['customer_name', 'customer_phone', 'delivery_address', 'delivery_fee', 'estimated_delivery_time'],
      },
    },
  });
}
