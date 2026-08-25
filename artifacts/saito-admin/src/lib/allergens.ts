import { Wheat, Fish, Milk, Egg, Nut, Bean, Shrimp, Sprout, Leaf, Shell, Flower2, FlaskConical, TriangleAlert, type LucideIcon } from 'lucide-react';

/**
 * ALLERGEN SSOT — Supabase:
 *   `allergens` (referans cədvəl: code, name, translations...) +
 *   `product_allergens` (junction: product_id ↔ allergen_id).
 *
 * Bu modul YALNIZ UI kataloqudur: DB `code` → lucide ikon + etiket fallback.
 * Adlar DB-dən gəlir (allergens.name / translations); burada hardcode edilən
 * `label` yalnız DB çatmadıqda fallback-dir.
 */

export interface AllergenUIDef {
  code: string;
  label: string;
  icon: LucideIcon;
}

export const ALLERGEN_UI: AllergenUIDef[] = [
  { code: 'gluten', label: 'Glüten', icon: Wheat },
  { code: 'fish', label: 'Balıq', icon: Fish },
  { code: 'milk', label: 'Süd', icon: Milk },
  { code: 'eggs', label: 'Yumurta', icon: Egg },
  { code: 'nuts', label: 'Fındıq/Qoz', icon: Nut },
  { code: 'soy', label: 'Soya', icon: Bean },
  { code: 'sesame', label: 'Küncüt', icon: Sprout },
  { code: 'shellfish', label: 'Xərçəngkimilər', icon: Shrimp },
  { code: 'molluscs', label: 'Mollusklar', icon: Shell },
  { code: 'celery', label: 'Kərəviz/Kələm', icon: Leaf },
  { code: 'mustard', label: 'Xardal', icon: FlaskConical },
  { code: 'sulfites', label: 'Sülfit', icon: FlaskConical },
  { code: 'lupin', label: 'Lupin', icon: Flower2 },
];

export const ALLERGEN_FALLBACK_ICON: LucideIcon = TriangleAlert;

export function allergenUIByCode(code: string): AllergenUIDef | null {
  return ALLERGEN_UI.find(a => a.code === String(code || '').toLowerCase()) || null;
}

/** jsonb/legacy shape → flat list: ["a"] | "a,b" | [{name}] hər hansısı */
export function parseAllergens(raw: any): any[] {
  const flat = (arr: any[]): any[] =>
    arr.map((a) => (typeof a === 'object' && a !== null ? a : String(a).trim())).filter(Boolean);
  try {
    let list: any = raw;
    if (typeof list === 'string') list = JSON.parse(list);
    if (Array.isArray(list)) return flat(list);
    if (list && typeof list === 'object') return flat(Object.values(list));
  } catch {
    if (typeof raw === 'string' && raw.trim()) return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/** Bir allergen qeydi (string və ya {code,name}) → UI def (ikon) */
export function resolveAllergenEntry(entry: any): AllergenUIDef | null {
  if (entry && typeof entry === 'object') {
    const byCode = allergenUIByCode(String(entry.code ?? ''));
    if (byCode) return byCode;
    return resolveByName(String(entry.name ?? ''));
  }
  return resolveByName(String(entry ?? ''));
}

function resolveByName(name: string): AllergenUIDef | null {
  const v = name.trim().toLowerCase();
  if (!v) return null;
  return (
    ALLERGEN_UI.find(a => a.label.toLowerCase() === v) ||
    ALLERGEN_UI.find(a => a.code === v) ||
    // legacy az/en free-text aliaslar (köhnə sətirlər üçün)
    ALLERGEN_UI.find(a => (
      (a.code === 'gluten' && ['qluten', 'un', 'buğda'].includes(v)) ||
      (a.code === 'fish' && ['balıq', 'balig', 'fish'].includes(v)) ||
      (a.code === 'milk' && ['süd', 'sud', 'dairy'].includes(v)) ||
      (a.code === 'eggs' && ['yumurta', 'egg', 'eggs'].includes(v)) ||
      (a.code === 'nuts' && ['fındıq', 'findiq', 'qoz', 'peanut', 'nut'].includes(v)) ||
      (a.code === 'soy' && ['soya'].includes(v)) ||
      (a.code === 'sesame' && ['küncüt', 'kuncut'].includes(v)) ||
      (a.code === 'shellfish' && ['xərçəng', 'xerceng', 'shrimp', 'karaqsan'].includes(v))
    )) ||
    null
  );
}
