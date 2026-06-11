import type { InventoryImportLine, InventoryImportPayload } from '@/types/recipes';

export type AiIngestionSource = 'recipe' | 'cookbook' | 'inventory' | 'calibration';

export interface AiIngestionMatch<TItem = unknown> {
  label: string;
  matchId: string | null;
  matchName: string | null;
  confidence: number;
  unmatchedCount: number;
  items: TItem[];
  manualReviewRequired: boolean;
  source: AiIngestionSource;
}

export interface InventoryReviewPayload {
  ok: boolean;
  source: 'ocr' | 'manual';
  payload: InventoryImportPayload;
  review: {
    manualReviewRequired: boolean;
    normalizedLines: Array<InventoryImportLine & {
      normalizedUnit: string;
      normalizedQuantity: number;
    }>;
    warnings: string[];
    reviewNotes: string[];
    fallbackMode: 'manual' | 'ocr';
  };
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function normalizeReviewLine(line: InventoryImportLine) {
  const normalizedQuantity = toNumber(line.quantity) ?? 0;
  const normalizedUnit = line.unit?.toLowerCase().trim() || 'piece';
  const reviewNotes: string[] = [];

  if (!line.name.trim()) reviewNotes.push('Missing product name');
  if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) reviewNotes.push('Invalid quantity');
  if (!line.unit?.trim()) reviewNotes.push('Missing unit');

  return {
    ...line,
    normalizedUnit,
    normalizedQuantity,
    reviewNotes,
  };
}

export function buildInventoryReview(payload: InventoryImportPayload): InventoryReviewPayload {
  const normalizedLines = (payload.lines || []).map(normalizeReviewLine);
  const warnings: string[] = [];
  const reviewNotes = normalizedLines.flatMap((line, index) =>
    line.reviewNotes.map((note) => `Line ${index + 1}: ${note}`)
  );

  if (normalizedLines.some((line) => !line.name.trim())) {
    warnings.push('Some inventory lines are missing a product name and need manual review.');
  }

  if (normalizedLines.some((line) => line.normalizedQuantity <= 0)) {
    warnings.push('Some inventory quantities are zero or invalid.');
  }

  if (normalizedLines.some((line) => !line.normalizedUnit)) {
    warnings.push('Some inventory units could not be normalized.');
  }

  const manualReviewRequired = warnings.length > 0 || normalizedLines.length === 0 || reviewNotes.length > 0;

  return {
    ok: true,
    source: 'ocr',
    payload,
    review: {
      manualReviewRequired,
      normalizedLines,
      warnings,
      reviewNotes,
      fallbackMode: payload.lines.length === 0 ? 'manual' : 'ocr',
    },
  };
}
