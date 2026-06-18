# Stock Page Animation System

## 1. AI Calibration Panel

### Açılma (Pill → Panel)
```
[AI Suggestions (3) ▼]   ← pill (kiçik, yumru)
         │  click
         ▼
┌─────────────────────────┐
│ AI Calibration          │  ← panel (böyük, içində kartlar)
│ Bağla                  │
│ ┌───────────────────┐  │
│ │ Un  (23.5%)       │  │  ← kartlar sıralı girir (stagger)
│ └───────────────────┘  │
│ ┌───────────────────┐  │
│ │ Şəkər  (15.2%)    │  │
│ └───────────────────┘  │
└─────────────────────────┘
```

**Motion:** `AnimatePresence mode="popLayout"`
- Pill çıxır: fade `opacity:0` + `y:-6`
- Panel girir: fade `opacity:1` + `y:0` (spring 320/28)
- **Blink yox** — pill-də `layoutId` yoxdur, panel-də var, üst-üstə düşmür

### Bağlanma
- **Bağla** düyməsi: panel `exit: opacity:0 + y:-10` (cəmi 120ms) — təmiz, scale morph yox
- Panel çıxır, pill geri girir: fade `opacity:1` + `y:0` (spring 260/22)

### Kartların Girişi (Stagger)
- 1-ci kart: delay 0ms → spring açılır
- 2-ci kart: delay 50ms → spring açılır
- 3-cü kart: delay 100ms → spring açılır
- 4-cü kart: delay 150ms → spring açılır

`initial: y:12` → `animate: y:0` hərəsi öz növbəsində, natural ardıcıllıq.

---

## 2. Calibration Kartına Klik → Morph + Optimistic Update

### Flow
```
Karta klik
    │
    ├── 1. onApplyStart() → morph overlay yaranır
    │       ┌─────────────────────┐
    │       │  card rect-dən      │  ← position: fixed
    │       │  row rect-inə uçur  │     spring 300/28/0.8
    │       │  opacity 1 → 0      │     500ms
    │       └─────────────────────┘
    │
    ├── 2. apply() → API çağırılır (parallel)
    │       POST /api/inventory/calibration/apply
    │
    ├── 3. API uğurlu → toast + optimistic update
    │       setData() → current_stock = theoretical_stock
    │       → variance 0 → kart avtomatik yox olur
    │       → background fetchData 3sn sonra (görünmür)
    │
    ├── 4. Morph bitdi → overlay silinir
    │       → row scrollIntoView center
    │
    └── 5. Nəticə: Səhifə reload YOX, blink YOX, təmiz object morph
```

### Görünən nədir?
- Kart kliklənir
- **Şəffaf yaşıl pill** kartın yerindən çıxıb inventory row-un üstünə uçur
- Kart original yerindən yox olur (variance=0 oldu)
- Row highlight olur (yaşıl parlama yox, sadəcə morph pill row-un üstündə sönür)
- Səhifənin qalan hissəsi DƏYİŞMİR — blink yox

---

## 3. Inventory Health Card

```
┌─────────────────────────────────────┐
│ ◉ 85   Inventory Health            │
│       12 normal · 3 kritik · 15 cəmi│  [Ətraflı]
│ ▓▓▓▓▓▓▓▓░░░░░░░░░░░ (health bar)   │
└─────────────────────────────────────┘
                │  click "Ətraflı"
                ▼
┌─────────────────────────────────────┐
│ (əvvəlki kimi)                      │
│ ─────────────────────────────────  │  ← layout spring ilə
│ ┌──────┬──────┬──────┬──────┐      │     açılır
│ │Normal│Kritik│ Bitib│İtki  │      │
│ │  12  │  2   │  1   │₼45.00│      │
│ └──────┴──────┴──────┴──────┘      │
│ ⚠ 1 xammal təcili diqqət           │
│ [un]                               │
└─────────────────────────────────────┘
```

**Motion:** `layout` prop + spring 280/28
- `layout` Framer Motion-un özü həndəsi keçidi idarə edir
- İçəridə `AnimatePresence` + content fade `y:-6` → `y:0`
- **height:0→auto həkkinə ehtiyac yox** — `layout` spring ilə hamar böyüyür

**Health Bar segmentləri:**
- Normal (yaşıl): width `0%` → `(normal/total)*100%` spring 120/20, delay 200ms
- Kritik (sarı): width `0%` → `(critical/total)*100%` spring 120/20, delay 300ms
- Bitib (qırmızı): width `0%` → `(out_of_stock/total)*100%` spring 120/20, delay 400ms

Hər seqment ayrı-ayrı canlanır, sanki su ilə dolur.

---

## 4. Search Morph

```
[🔍]           ← icon button (w-10 h-10)
  │ click
  ▼
┌─────────────────────────────────────┐
│ 🔍 Xammal axtar...            [✕]  │  ← layout spring 350/30
└─────────────────────────────────────┘  ilə genişlənir
  │ Escape / blur (input boşdursa)
  ▼
[🔍]           ← geri kiçilir
```

**Motion:** `layout` prop bir container-də
- Container `w-10 h-10` → `w-full` (və ya əksi)
- Element SWAP yox — eyni container ölçüsünü dəyişir
- Input `onBlur`: yalnız input boşdursa bağlanır (yazı varsa açıq qalır)

---

## 5. Tab Bar (Stock / Tədarük / İntellekt / Tarixçə)

```
┌─────────────────────────────────────┐
│ [ Stok ] [Tədarük] [İntellekt] [Tarixçə] │
│  ██████                                │  ← layoutId="tab-indicator"
│  ← indicator seçilmiş tab-dan         │     spring 380/30
│     digərinə sürüşür                  │
└─────────────────────────────────────┘
```

**Motion:** `layoutId="tab-indicator"` — indicator pill-i fiziki obyekt kimi hərəkət edir:
- Növbəti tab-a klik → pill sürüşüb ora keçir
- Geri klik → pill geri sürüşür
- Stiffness 380, damping 30 — sərt deyil, ipək kimi

Eyni pattern Procurement subtab-larında da var (`layoutId="proc-tab-indicator"`).

---

## Ümumi Prinsiplər

| Element | Spring | Damping | Mass | Effekt |
|---------|--------|---------|------|--------|
| Morph overlay | 300 | 28 | 0.8 | Ağır, hamar uçuş |
| Tab indicator | 380 | 30 | 1 | Dəqiq, səlis sürüşmə |
| Health card expand | 280 | 28 | 1 | Təbii böyümə |
| Health bar seg. | 120 | 20 | 1 | Yavaş, elastik dolma |
| Calibration card | 320 | 28 | 1 | Orta sürət, hamar |
| Calibration pill | 260 | 22 | 1 | Yüngül, tez |
| Search morph | 350 | 30 | 1 | Səlis genişlənmə |

**Kardinal qaydalar:**
1. Heç bir element `opacity + scale` generic fade ilə girmir — hər şey öz məkanından gəlir (object continuity)
2. Heç bir əməliyyat səhifə reload-i yaratmır — optimistic update + background refresh
3. `layout` prop istifadə olunur — `height:auto` animasiya hack-i yox
4. Bütün animasiyalar spring fizikası ilə işləyir — cubic-bezier yox
