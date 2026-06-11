export type QuantityUnit = 'mg' | 'g' | 'kg' | 'ml' | 'l' | 'piece' | 'pcs'
  | 'tsp' | 'tbsp' | 'cup' | 'oz' | 'lb' | 'qt' | 'pt' | 'fl_oz';

export type BaseQuantityUnit = 'g' | 'ml' | 'piece';

export interface NormalizedQuantity {
  value: number;
  unit: BaseQuantityUnit;
}

// Hamısı baz vahidə çevrilir: g, ml, piece
const MASS_UNITS: Record<string, number> = {
  mg: 0.001,
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
};

const VOLUME_UNITS: Record<string, number> = {
  ml: 1,
  l: 1000,
  tsp: 4.92892,
  tbsp: 14.7868,
  cup: 236.588,
  fl_oz: 29.5735,
  qt: 946.353,
  pt: 473.176,
};

const PIECE_UNITS: Record<string, number> = {
  piece: 1,
  pcs: 1,
};

export function normalizeQuantity(value: number, unit: QuantityUnit): NormalizedQuantity {
  const safeValue = Number(value) || 0;

  if (unit in MASS_UNITS) {
    return { value: safeValue * MASS_UNITS[unit], unit: 'g' };
  }

  if (unit in VOLUME_UNITS) {
    return { value: safeValue * VOLUME_UNITS[unit], unit: 'ml' };
  }

  return { value: safeValue * (PIECE_UNITS[unit] || 1), unit: 'piece' };
}

export function denormalizeQuantity(value: number, targetUnit: QuantityUnit): number {
  const safeValue = Number(value) || 0;

  if (targetUnit in MASS_UNITS) {
    return safeValue / MASS_UNITS[targetUnit];
  }

  if (targetUnit in VOLUME_UNITS) {
    return safeValue / VOLUME_UNITS[targetUnit];
  }

  return safeValue / (PIECE_UNITS[targetUnit] || 1);
}

export function getUnitBase(unit: QuantityUnit): BaseQuantityUnit {
  if (unit in MASS_UNITS) return 'g';
  if (unit in VOLUME_UNITS) return 'ml';
  return 'piece';
}

export function formatBaseQuantity(value: number, unit: BaseQuantityUnit): string {
  const safeValue = Number(value) || 0;
  return `${safeValue.toFixed(unit === 'piece' ? 0 : 2)} ${unit}`;
}

export function getAllUnits(): { value: QuantityUnit; label: string; base: BaseQuantityUnit }[] {
  return [
    { value: 'g', label: 'g', base: 'g' },
    { value: 'kg', label: 'kg', base: 'g' },
    { value: 'mg', label: 'mg', base: 'g' },
    { value: 'oz', label: 'oz (unsiya)', base: 'g' },
    { value: 'lb', label: 'lb (funt)', base: 'g' },
    { value: 'ml', label: 'ml', base: 'ml' },
    { value: 'l', label: 'l', base: 'ml' },
    { value: 'tsp', label: 'ç.q (tsp)', base: 'ml' },
    { value: 'tbsp', label: 'x.q (tbsp)', base: 'ml' },
    { value: 'cup', label: 'stəkan (cup)', base: 'ml' },
    { value: 'fl_oz', label: 'fl oz', base: 'ml' },
    { value: 'qt', label: 'kvart (qt)', base: 'ml' },
    { value: 'pt', label: 'pint (pt)', base: 'ml' },
    { value: 'piece', label: 'ədəd', base: 'piece' },
    { value: 'pcs', label: 'pcs', base: 'piece' },
  ];
}
