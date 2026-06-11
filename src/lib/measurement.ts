import type { IngredientUnit, MeasurementUnit } from '@/types/inventory';

export type MeasurementCategory = 'weight' | 'volume' | 'count';

const MEASUREMENT_UNITS: MeasurementUnit[] = [
  { unit: 'gram', category: 'weight', normalized_unit: 'g', multiplier: 1 },
  { unit: 'kg', category: 'weight', normalized_unit: 'g', multiplier: 1000 },
  { unit: 'ml', category: 'volume', normalized_unit: 'ml', multiplier: 1 },
  { unit: 'l', category: 'volume', normalized_unit: 'ml', multiplier: 1000 },
  { unit: 'piece', category: 'count', normalized_unit: 'pcs', multiplier: 1 },
  { unit: 'pcs', category: 'count', normalized_unit: 'pcs', multiplier: 1 },
];

const UNIT_ALIASES: Record<string, IngredientUnit> = {
  g: 'gram',
  gram: 'gram',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  piece: 'piece',
  pcs: 'pcs',
};

export function normalizeIngredientUnit(unit: string): IngredientUnit {
  return UNIT_ALIASES[unit] ?? 'piece';
}

export function getMeasurementUnit(unit: IngredientUnit) {
  return MEASUREMENT_UNITS.find((entry) => entry.unit === unit) ?? null;
}

export function normalizeMeasurement(quantity: number, unit: IngredientUnit) {
  const measurement = getMeasurementUnit(unit);
  if (!measurement) {
    return { quantity, unit, normalizedUnit: 'pcs', category: 'count' as MeasurementCategory };
  }

  return {
    quantity: quantity * measurement.multiplier,
    unit,
    normalizedUnit: measurement.normalized_unit,
    category: measurement.category as MeasurementCategory,
  };
}

export function denormalizeMeasurement(quantity: number, unit: IngredientUnit) {
  const measurement = getMeasurementUnit(unit);
  if (!measurement) return quantity;
  return quantity / measurement.multiplier;
}

export function formatMeasurement(quantity: number, unit: IngredientUnit, useNormalized = false) {
  const measurement = getMeasurementUnit(unit);
  if (!measurement) return `${quantity} ${unit}`;

  const displayQuantity = useNormalized ? denormalizeMeasurement(quantity, unit) : quantity;

  if (measurement.unit === 'kg') return `${displayQuantity.toFixed(displayQuantity % 1 === 0 ? 0 : 2)} kg`;
  if (measurement.unit === 'l') return `${displayQuantity.toFixed(displayQuantity % 1 === 0 ? 0 : 2)} l`;
  if (measurement.unit === 'piece' || measurement.unit === 'pcs') return `${displayQuantity.toFixed(displayQuantity % 1 === 0 ? 0 : 2)} pcs`;
  return `${displayQuantity.toFixed(displayQuantity % 1 === 0 ? 0 : 2)} ${measurement.unit}`;
}

export function getMeasurementOptions() {
  return MEASUREMENT_UNITS.map((item) => ({
    value: item.unit,
    label: item.unit === 'piece' ? 'pcs' : item.unit,
    category: item.category,
  }));
}
