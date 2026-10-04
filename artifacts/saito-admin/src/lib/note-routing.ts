/**
 * note-routing — 12x (owner: "sistem özəmənn hər 3 dilini tanıdıqda derinən,
 * yeni məhsulu da tanısın").
 *
 * Order-level note ("Sifariş qeydi") smart routing engine: a comma-separated
 * note is split into segments; each segment is matched against the order's
 * PRODUCT names + modifier names so every station card shows ONLY the note
 * text that concerns its own products.
 *
 * MULTILINGUAL DEPTH (AZ / EN / RU, Cyrillic included):
 *   1. normalize: tr-lowercase → NFD accent-strip → alphanumeric (ç→c, ş→s,
 *      ğ dropped, ə dropped) — same pipeline for note AND product tokens, so
 *      both sides live in one space.
 *   2. Cyrillic transliteration (RU → Latin): "филадельфия" → "filadelfiya",
 *      "чай" → "chai" — proper product names typed in RU match EN menu names.
 *   3. CONCEPT dictionary: ~40 common restaurant concepts, each with AZ/EN/RU
 *      surface forms — "çay" ≈ "tea" ≈ "чай", "soğan" ≈ "garlic" ≈ "лук",
 *      "холодный" ≈ "cold" ≈ "soyuq" → a note in ANY language routes to the
 *      product whose name carries the concept.
 *   4. light stemming (plural/case/possessive tails: -lar/-ler/-s/-es/-si/-y…)
 *      on both sides.
 *   5. typo-tolerance: Hamming ≤ 1 ("soyuqu"≈"soyuq", "tee"≈"tea") + prefix
 *      (len ≥ 4, "filadelfiya classic" style partials).
 *
 * Route result per segment: the station of the matched item(s), or `null`
 * = GENERAL (matched nothing, or matched items of EVERY station on the
 * order) — general segments render on all station cards (they concern the
 * table/order, not a product). Cross-language guesses are deliberately
 * conservative: no dictionary concept → no match → general (never a wrong
 * station).
 *
 * Pure module — no React, no DB. KDSView feeds it the order's items with
 * already-resolved station ids.
 */

const CYR_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y',
  ь: '', э: 'e', ю: 'yu', я: 'ya',
};

const hasCyr = (s: string) => /[а-яё]/i.test(s);

/** lowercase + Cyrillic→Latin translit + accent-strip + alnum-only. */
export function normTok(s: string): string {
  let t = (s || '').toLocaleLowerCase('tr');
  if (hasCyr(t)) {
    t = t
      .replace(/дж/g, 'dj')
      .split('')
      .map(c => CYR_MAP[c] ?? c)
      .join('');
  }
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

/** light stem variants: strip ONE trailing plural/case/possessive tail. */
const SUFFIXES = ['lard', 'lerd', 'lardan', 'lerden', 'lar', 'ler', 'li', 'ly', 'siz', 'si', 'es', 's', 'y', 'ov', 'ev'];
export function stemVariants(t: string): string[] {
  const out: string[] = [];
  for (const suf of SUFFIXES) {
    if (t.length - suf.length >= 3 && t.endsWith(suf)) {
      const s = t.slice(0, -suf.length);
      if (!out.includes(s)) out.push(s);
      break; // one strip max
    }
  }
  return out;
}

/**
 * CONCEPTS — canonical concept → surface forms (AZ/EN/RU; raw, normalized at
 * init). Kept deliberately compact: high-frequency restaurant vocabulary.
 * Unknown words stay unknown → they fall back to token/typo matching.
 */
const CONCEPTS: Record<string, string[]> = {
  tea: ['tea', 'çay', 'чай', 'shay', 'chay'],
  coffee: ['coffee', 'kahve', 'кофе', 'espresso', 'latte', 'cappuccino', 'mocha', 'americano'],
  water: ['water', 'su', 'voda', 'ayran'],
  juice: ['juice', 'meyve', 'şirə', 'сок', 'mors', 'smoothie'],
  soda: ['soda', 'cola', 'pepsi', 'fanta', 'sprite', 'gazlı', 'газировка', 'lemonade', 'limonata'],
  milk: ['milk', 'sütlü', 'молоко'],
  shake: ['shake', 'şeyk', 'шейк', 'milkshake'],
  pizza: ['pizza', 'піца', 'neapoliten', 'margarita', 'hawaiian', 'pepperoni', 'karbonara'],
  pasta: ['pasta', 'makkaroni', 'spagetti', 'penne', 'ravioli', 'lazanya', 'пасти'],
  salad: ['salad', 'salat', 'салат', 'cesar', 'cezer', 'greek', 'olivye'],
  soup: ['soup', 'şorb', 'суп', 'shurba', 'borsh', 'bulon', 'creme', 'cream of'],
  burger: ['burger', 'hamburger', 'cheeseburger', 'бургер'],
  sandwich: ['sandwich', 'sendviç', 'сэндвич', 'toast', 'croissant', 'kruasan'],
  steak: ['steak', 'biftek', 'стек', 'ribeye', 'tenderloin'],
  fish: ['fish', 'balıq', 'рыба', 'somon', 'salmon', 'laks', 'tun', 'tuna', 'levrek', 'lutefish'],
  seafood: ['lobster', 'langust', 'krevet', 'shrimp', 'karides', 'krevetka', 'prawn', 'calamari', 'middy', 'dengiz'],
  chicken: ['chicken', 'tücür', 'курица', 'drumstick', 'wing'],
  meat: ['meat', 'ətli', 'мясо', 'etli', 'ettesi', 'beef', 'dana', 'goosht'],
  rice: ['rice', 'gila', 'рис', 'grich', 'pirinç', 'pilaf', 'pilau'],
  bread: ['bread', 'çörək', 'хлеб', 'baguette', 'bun', 'keks'],
  potato: ['potato', 'batat', 'картофель', 'kartofel', 'tater', 'fried'],
  egg: ['egg', 'yumurta', 'яйцо', 'omelet', 'omelette'],
  cream: ['cream', 'krem', 'сливки', 'kremli', 'vanilla', 'frosting'],
  sauce: ['sauce', 'sous', 'соус', 'sos', 'pesto', 'marinara', 'sals'],
  cheese: ['cheese', 'pendir', 'сыр', 'cheedar', 'chedar', 'mozzarella', 'mozarella'],
  garlic: ['garlic', 'soğan', 'лук', 'sovan', 'garnik'],
  onion: ['onion', 'piyaz', 'red onion'],
  pepper: ['pepper', 'biber', 'перец', 'jalapeno', 'paprika'],
  tomato: ['tomato', 'pomidor', 'помидор', 'domates'],
  cucumber: ['cucumber', 'xiyar', 'огурец', 'maroul'],
  lemon: ['lemon', 'limon', 'лайм', 'lime'],
  honey: ['honey', 'bal', 'мёд', 'balı'],
  dessert: ['dessert', 'tətlı', 'десерт', 'cake', 'tort', 'muffin', 'ice cream', 'sundae', 'pudding', 'flan'],
  ice: ['ice', 'buz', 'лёд', 'frozen'],
  cold: ['cold', 'soyuq', 'холодный', 'chilled', 'shishir'],
  hot: ['hot', 'isti', 'горячий', 'warm', 'tandoori', 'qaynar'],
  spicy: ['spicy', 'acı', 'острый', 'picante', 'hot sauce', 'acılı', 'acıdır'],
  sweet: ['sweet', 'tətlı', 'сладкий', 'shirin', 'sugar', 'şeker'],
  without: ['without', 'siz', 'без', 'no', 'qada', 'qadaq', 'olmadan', 'yoxdur', 'free'],
  extra: ['extra', 'əlavə', 'дополнительно', 'aleve', 'daha', 'cheyle', 'cheyin', 'add', 'plus'],
};

const conceptMap = new Map<string, string>();
for (const [canonical, forms] of Object.entries(CONCEPTS)) {
  for (const f of forms) {
    const n = normTok(f);
    if (n.length >= 3 && !conceptMap.has(n)) conceptMap.set(n, canonical);
    // also register the stem variants (e.g. 'soly' of 'холодный')
    for (const sv of stemVariants(n)) if (!conceptMap.has(sv)) conceptMap.set(sv, canonical);
  }
}
export function conceptOf(t: string): string | null {
  const n = normTok(t);
  if (n.length < 3) return null;
  if (conceptMap.has(n)) return conceptMap.get(n)!;
  for (const sv of stemVariants(n)) if (conceptMap.has(sv)) return conceptMap.get(sv)!;
  return null;
}

const hamming1 = (a: string, b: string): boolean => {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let d = 0;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i] && ++d > 1) return false;
  return true;
};

/**
 * Do two tokens "refer to the same thing"? (normalized forms, len ≥ 3 each
 * for concept/typo checks — 1-2 letter tokens are pure noise.)
 */
export function tokensMatch(a: string, b: string): boolean {
  const na = normTok(a);
  const nb = normTok(b);
  if (na.length < 2 || nb.length < 2) return false;
  const candA = [na, ...stemVariants(na)];
  const candB = [nb, ...stemVariants(nb)];
  // 1) equal (after light stem)
  if (candA.some(x => candB.includes(x))) return true;
  // 2) shared concept (AZ/EN/RU dictionary)
  if (na.length >= 3 && nb.length >= 3) {
    const ca = conceptOf(na) ?? candA.map(conceptOf).find(Boolean) ?? null;
    const cb = conceptOf(nb) ?? candB.map(conceptOf).find(Boolean) ?? null;
    if (ca && ca === cb) return true;
  }
  // 3) typo-tolerant (Hamming ≤ 1)
  if (na.length >= 3 && nb.length >= 3 && hamming1(na, nb)) return true;
  if (candA.some(x => candB.some(y => x.length >= 3 && y.length >= 3 && hamming1(x, y)))) return true;
  // 4) prefix (len ≥ 4)
  if (na.length >= 4 && nb.length >= 4 && (na.startsWith(nb) || nb.startsWith(na))) return true;
  if (candA.some(x => x.length >= 4 && candB.some(y => y.length >= 4 && (x.startsWith(y) || y.startsWith(x))))) return true;
  return false;
}

export interface RoutingItem {
  /** resolved station id ('' when unknown) */
  stationId: string;
  name: string;
  modifiers?: { name?: string; [k: string]: unknown }[] | null;
}

export interface NoteSegment {
  /** null = GENERAL (render on all stations) */
  stationId: string | null;
  text: string;
}

/** Split the raw note into segments (comma / semicolon / bullet). */
export function splitNoteSegments(raw: string | null | undefined): string[] {
  return (raw || '')
    .split(/[,;•]/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Route each note segment to the station(s) of the product(s) it mentions.
 * A segment that mentions items of MORE THAN ONE station, or nothing at
 * all, is GENERAL (stationId null).
 */
export function routeNoteSegments(rawNote: string | null | undefined, items: RoutingItem[]): NoteSegment[] {
  const segs = splitNoteSegments(rawNote);
  if (segs.length === 0) return [];
  const itemToks = items
    .filter(i => i && i.name)
    .map(i => {
      const toks: string[] = (i.name || '').split(/\s+/);
      (i.modifiers || []).forEach(m => { if (m && m.name) toks.push(m.name); });
      return { st: i.stationId || '', toks };
    });
  const allStations = new Set(itemToks.map(x => x.st).filter(Boolean));
  return segs.map(text => {
    const noteToks = text.split(/\s+/);
    const matched = new Set<string>();
    for (const it of itemToks) {
      const hit = noteToks.some(nt => it.toks.some(pt => tokensMatch(nt, pt)));
      if (hit) matched.add(it.st);
    }
    if (matched.size === 0 || (allStations.size > 1 && matched.size >= allStations.size)) {
      return { stationId: null, text };
    }
    return { stationId: [...matched][0], text };
  });
}

/** The note text a given station card should render (its segments + general). */
export function scopedNoteFor(segments: NoteSegment[], stationId: string): string {
  return segments
    .filter(s => s.stationId === null || s.stationId === stationId)
    .map(s => s.text)
    .join(' · ');
}
