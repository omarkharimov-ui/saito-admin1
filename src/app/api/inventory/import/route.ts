import { NextResponse } from 'next/server';
import { importProcurementPayload } from '@/lib/procurement';
import type { InventoryImportPayload } from '@/types/recipes';

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as InventoryImportPayload;
    const result = await importProcurementPayload(payload);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to import inventory payload' },
      { status: 500 }
    );
  }
}
