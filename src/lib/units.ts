export type QuantityUnit = 'mg' | 'g' | 'kg' | 'ml' | 'l' | 'piece' | 'pcs';

export type BaseQuantityUnit = 'g' | 'ml' | 'piece';

export interface NormalizedQuantity {
  value: number;
  unit: BaseQuantityUnit;
}

const MASS_UNITS: Record<Extract<QuantityUnit, 'mg' | 'g' | 'kg'>, number> = {
  mg: 0.001,
  g: 1,
  kg: 1000,
};

const VOLUME_UNITS: Record<Extract<QuantityUnit, 'ml' | 'l'>, number> = {
  ml: 1,
  l: 1000,
};

const PIECE_UNITS: Record<Extract<QuantityUnit, 'piece' | 'pcs'>, number> = {
  piece: 1,
  pcs: 1,
};

export function normalizeQuantity(value: number, unit: QuantityUnit): NormalizedQuantity {
  const safeValue = Number(value) || 0;

  if (unit in MASS_UNITS) {
    return { value: safeValue * MASS_UNITS[unit as keyof typeof MASS_UNITS], unit: 'g' };
  }

  if (unit in VOLUME_UNITS) {
    return { value: safeValue * VOLUME_UNITS[unit as keyof typeof VOLUME_UNITS], unit: 'ml' };
  }

  return { value: safeValue * PIECE_UNITS[unit as keyof typeof PIECE_UNITS], unit: 'piece' };
}

export function denormalizeQuantity(value: number, targetUnit: QuantityUnit): number {
  const safeValue = Number(value) || 0;

  if (targetUnit in MASS_UNITS) {
    return safeValue / MASS_UNITS[targetUnit as keyof typeof MASS_UNITS];
  }

  if (targetUnit in VOLUME_UNITS) {
    return safeValue / VOLUME_UNITS[targetUnit as keyof typeof VOLUME_UNITS];
  }

  return safeValue / PIECE_UNITS[targetUnit as keyof typeof PIECE_UNITS];
}

export function getUnitBase(unit: QuantityUnit): BaseQuantityUnit {
  if (unit === 'mg' || unit === 'g' || unit === 'kg') return 'g';
  if (unit === 'ml' || unit === 'l') return 'ml';
  return 'piece';
}

export function formatBaseQuantity(value: number, unit: BaseQuantityUnit): string {
  const safeValue = Number(value) || 0;
  return `${safeValue.toFixed(unit === 'piece' ? 0 : 2)} ${unit}`;
}
