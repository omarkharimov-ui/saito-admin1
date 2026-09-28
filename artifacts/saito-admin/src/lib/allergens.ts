import { Wheat, Fish, Milk, Egg, Nut, Bean, Shrimp, Sprout, Leaf, Shell, Flower2, FlaskConical, TriangleAlert, Wine, type LucideIcon } from '@/components/ui/saito-icons';

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
  { code: 'alcohol', label: 'Alkol', icon: Wine },
];

// 2026-09-29 (owner: "icon pakei yüklüdür — məhsulların allergenləri yarandıkca
// sistem ona uyğun allergen/ikon qoysun"): free-text allergen names that are
// NOT one of the known codes/labels get AUTO-ASSIGNED to the closest family by
// keyword (az/en/tr), so a newly-created allergen ("Qarğıdalı", "Şərab",
// "Pistachio"…) instantly renders with a fitting icon instead of the generic
// warning triangle. Matching = substring on the lowercased name.
const ALLERGEN_KEYWORDS: Array<[string, string[]]> = [
  ['gluten',  ['qluten', 'gluten', 'buğda', 'bugda', 'wheat', 'çovdar', 'rye', 'barley', 'yulaf', 'oat']],
  ['fish',    ['balıq', 'balig', 'balık', 'fish', 'ryba', 'somon', 'salmon', 'levrek', 'perch', 'tuna']],
  ['milk',    ['süd', 'sud', 'süt', 'sütlük', 'dairy', 'milk', 'lakt', 'laktoz', 'lactose', 'peynir', 'cheese', 'ghee', 'qaymaq', 'cream', 'butter']],
  ['eggs',    ['yumurta', 'egg', 'eggs', 'eier']],
  ['nuts',    ['fındıq', 'findiq', 'qoz', 'qozu', 'peanut', 'qarğıdalı', 'qarqadali', 'yerfıstığı', 'yer fistigi', 'walnut', 'ceviz', 'almond', 'badam', 'cashew', 'macadamia', 'hazelnut', 'fıstıq', 'fistiq', 'pista', 'pistachio', 'kaju']],
  ['soy',     ['soya', 'soy', 'tofu', 'edamame']],
  ['sesame',  ['küncüt', 'kuncut', 'susam', 'sesame']],
  ['shellfish',['xərçəng', 'xerceng', 'shrimp', 'şrimt', 'srimit', 'krab', 'crab', 'lobster', 'kreyvis', 'karides', 'istiq', 'squid', 'kalamar']],
  ['molluscs',['mollusc', 'mollyusk', 'oyster', 'istiridye', 'salyangan', 'snail', 'mussel', 'midye', 'conch']],
  ['celery',  ['kərəviz', 'kareviz', 'celery']],
  ['mustard', ['xardal', 'mustard', 'hardal']],
  ['sulfites',['sülfit', 'sulfit', 'sulfite']],
  ['lupin',   ['lupin', 'lupine']],
  ['alcohol', ['alkol', 'alkogol', 'alcohol', 'spirt', 'wine', 'şərab', 'seferab', 'şarab']],
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
    // 2026-09-29: keyword auto-assign (any free-text allergen name → closest
    // family icon). Substring scan over the multi-language keyword table.
    (() => {
      const hit = ALLERGEN_KEYWORDS.find(([, kws]) => kws.some(k => v.includes(k)));
      return hit ? ALLERGEN_UI.find(a => a.code === hit[0]) || null : null;
    })() ||
    null
  );
}
