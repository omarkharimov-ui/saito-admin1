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
  manualReviewRequired?: boolean;
  reviewNotes?: string[];
  rawText?: string | null;
}

export interface InventoryImportLine {
  name: string;
  quantity: number | string;
  unit: string;
  unit_cost?: number | string | null;
  total_cost?: number | string | null;
  waste_percentage?: number | string | null;
}

export interface InventoryImportPayload {
  supplierName?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  currency?: string | null;
  totalAmount?: number | string | null;
  totalTax?: number | string | null;
  notes?: string | null;
  lines: InventoryImportLine[];
}
