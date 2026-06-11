import { NextResponse } from 'next/server';
import type { InventoryImportPayload } from '@/types/recipes';

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as InventoryImportPayload;

    if (!payload || !Array.isArray(payload.lines) || payload.lines.length === 0) {
      return NextResponse.json(
        { error: 'Import payload must include at least one line item' },
        { status: 400 }
      );
    }

    const normalized = {
      ...payload,
      supplierName: payload.supplierName?.trim() || null,
      invoiceNumber: payload.invoiceNumber?.trim() || null,
      invoiceDate: payload.invoiceDate?.trim() || null,
      currency: payload.currency?.trim() || null,
      notes: payload.notes?.trim() || null,
      totalAmount: typeof payload.totalAmount === 'number' ? payload.totalAmount : null,
      totalTax: typeof payload.totalTax === 'number' ? payload.totalTax : null,
      lines: payload.lines.map((line) => ({
        name: line.name.trim(),
        quantity: line.quantity,
        unit: line.unit.trim(),
        unit_cost: typeof line.unit_cost === 'number' ? line.unit_cost : null,
        total_cost: typeof line.total_cost === 'number' ? line.total_cost : null,
        waste_percentage: typeof line.waste_percentage === 'number' ? line.waste_percentage : null,
      })),
    } satisfies InventoryImportPayload;

    return NextResponse.json({
      ok: true,
      source: 'ocr',
      payload: normalized,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to import inventory payload' },
      { status: 500 }
    );
  }
}
