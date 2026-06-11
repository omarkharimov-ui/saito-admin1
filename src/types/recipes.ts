export type RecipeSourceType = 'ai' | 'cookbook' | 'ocr';

export interface NormalizedRecipeIngredient {
  name: string;
  quantity: number;
  unit: string;
}

export interface NormalizedRecipeSuggestion {
  recipeName: string;
  suggestedProductId: string | null;
  suggestedProductName: string | null;
  confidence: number;
  ingredients: NormalizedRecipeIngredient[];
  unmatchedIngredients: number;
  source: RecipeSourceType;
}

export interface InventoryImportLine {
  name: string;
  quantity: number;
  unit: string;
  unit_cost?: number | null;
  total_cost?: number | null;
  waste_percentage?: number | null;
}

export interface InventoryImportPayload {
  supplierName?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  currency?: string | null;
  totalAmount?: number | null;
  totalTax?: number | null;
  notes?: string | null;
  lines: InventoryImportLine[];
}
