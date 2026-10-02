# SAITO POS KDS "12q" E2E — status-revert + button-latency verify

- **Mühit:** dev `http://localhost:3000` (live HMR, restart ETMƏDİ), user Chrome.
  Qeyd: built-in browser Settings-də söndürülüb → user Chrome istifadə olundu.
  Tab A = `/admin/kds`, Tab B = `/admin/pos`.
- **DB saatı:** `now()` ≈ `2026-10-02 20:15 UTC` (≈ 03 Okt 00:15 Baku).
- **Qadağa gözlənildi:** "Servisə Ver" basılmadı, sifariş silinmədi.
- **Nəticə bazası:** /Users/mr.apple/saito-admin1/artifacts/saito-admin/e2e-shots/

## Mühit hazırlığı (fixture, bug deyil)
1. Hər iki hədəf sifariş `created_at = 2026-10-02` (Baku üzrə "dünən") idi → KDS "GÜN / bugün" filtri `0 aktiv sifariş` göstərirdi. Testin işləməsi üçün **yalnız bu iki sifarişin** `created_at`/`updated_at`-i `now()`-a dartıldı (serve/delete YOX).
2. Delivery sifarişinə unikal marker: `customer_phone = 'R12Q-A'` (KDS-də hədəfi dəqiq seçmək üçün).
3. Mövcud `/admin/kds` tabı Chrome debugger icazəsini rədd etdi → təmiz agent tabı açıldı.

## ADIM 1 — BASELINE (psql)
| order | tip | ad | ost | item | ist | prepared |
|---|---|---|---|---|---|---|
| `76598434-6267-490f-80d1-596ce8429427` | delivery (#E2E-P, "E2E Wolt") | Dragon Roll | ready | Dragon Roll | ready | 0 |
| `f48aac33-a107-40d5-b9c8-912c91ba474c` | dine_in (ORD-2953, Masa 992) | Tom Yam | ready | Tom Yam | ready | 0 |

## ADIM 2 — RECALL + AUTO-ACCEPT (E2E Wolt / Dragon Roll) — **PASS**
- Item ✓ basıldı (title = **"Tiki çıxar"** → RECALL).
- Kart in-progress bölməsinə düşdü, label **HAZIRLANIR** (GÖZLƏYİR yox), "Hazırdır" CTA göründü.
- 10s sonra DB: **`ost = accepted`**, **`ist = accepted`** (accept route item-align fix İŞLƏYİR), `prepared = 0`.
- 📷 `r12q-recall-reaccept.png`

## ADIM 3 — TİCK DEMOTION TEST — **PASS**
- Item ✓ basıldı (title = "Hazırdır" → tick).
- 5s sonra DB: **`ost = accepted` QALIR** (evvelki bug-da `pending`-ə düşürdü — indi DÜŞMÜR), **`ist = accepted`**, **`prepared = 1`**.
- KDS label **HAZIRLANIR**.
- Qeyd: kartda "1/1" sayğacı göstərilmir, çünki sayğac yalnız ≥2 item-li kartlarda render olunur (tək item-də görünmür) — tick özü item üzərində görünür. Bu UI detalıdır, demotion deyil.
- 📷 `r12q-tick-stable.png`

## ADIM 4 — LATENCY TEST (optimistic) — **PASS**
- `performance.mark` + JS ilə CTA **"Hazırdır"**-a klik; rAF loop kartın `border-emerald-500`-ə keçməsini ölçdü.
- **Nəticə: 23 ms** (≤ 500 ms). Klik anında CTA-bar yox oldu, kart emerald oldu.
  - className əvvəl: `...border p-4 transition-colors`
  - className sonra: `...transition-colors duration-300 border-emerald-500/40 bg-w...`
  - `ctaGone = true`

## ADIM 5 — NO-REVERT (delivery) — **PASS**
- "Hazırdır"dan sonra 12s (2 poll) gözlənildi.
- Kart **emerald** qaldı, label **SERVİSƏ HAZIRDIR** (geri düşmə YOX).
- DB: **`ost = ready`**, **`ist = ready`**, `prepared = 1`.
- 📷 `r12q-stable-ready.png`

## ADIM 6 — POS CHIP (Masa 992 / Tom Yam) — **PARTIAL (10s keçdi, sonra transient dalğalanma)**
1. **Baseline:** Masa 992 POS çipi = **SERVİSƏ HAZIRDIR** ✓.
2. KDS-də Tom Yam ✓ (recall) → 10s içində POS çipi **HAZIRLANIR** (legit demotion; DB: `ost=accepted, ist=accepted`) — gözlənilən davranış, qeyd olunur.
3. KDS-də "Hazırdır" CTA → **10s içində POS çipi = SERVİSƏ HAZIRDIR** (DB: `ost=ready, ist=ready`). İki dəfə 10s aralı oxunuşda hər ikisi **SERVİSƏ HAZIRDIR** → **≥10s STABLE ✓**.
4. ⚠️ **Diqqət (residual):** CTA-dan ≈46s sonra (`orders.updated_at = 20:19:42`) DB-də status səviyyəsində `ready → accepted` endi (`prepared` 0→1), POS çipi qısa müddət **GÖZLƏYİR → HAZIRLANIR** oldu, sonra `20:19:54`-də yenidən `ready`-yə qalxdı və **stabil `ready`** qaldı (2 dəq+).
   - Bu **UI stale-poll revert DEYİL** — DB dəyərinin özü dəyişdi (server/DB tərəfli recompute). Məcburi 10s pəncərəsi keçdi, lakin tam "revert yoxdur" tələbi üzrə qalıq qeyri-stabillik var.
- 📷 `r12q-pos-chip.png`
- Final DB: `f48aac33 → ost=ready, ist=ready, prepared=1`.

## ADIM 7 — LIGHT MODE (KDS) — **PASS**
- Light rejimdə KDS oxunaqlıdır (ağ kart, tünd mətn, yaşıl status/✓), 15s gözlənildi.
- 📷 `r12q-light.png` → sonra dark-a qaytarıldı.

## ADIM 8 — CONSOLE + WARNING CƏMİ — **PASS (0 error)**
| tab | console |
|---|---|
| A (`/admin/kds`) | **0 error/warning** — yalnız `[HMR] connected`, React DevTools info |
| B (`/admin/pos`) | **0 error/warning** — yalnız `[pos-sync]` debug + HMR |

## Yekun
| Addım | Nəticə |
|---|---|
| 1 Baseline | PASS |
| 2 Recall+reaccept | **PASS** |
| 3 Tick demotion | **PASS** |
| 4 Latency | **PASS — 23 ms** |
| 5 No-revert (delivery) | **PASS** |
| 6 POS chip | **PARTIAL** (10s stable ✓; ≈46s-də transient DB demotion, özü bərpa olundu) |
| 7 Light mode | PASS |
| 8 Console | PASS (0 error) |

**Final DB:** `76598434 → ready/ready/prepared=1`; `f48aac33 → ready/ready/prepared=1`.

**Screenşotlar:** `r12q-recall-reaccept.png`, `r12q-tick-stable.png`, `r12q-stable-ready.png`, `r12q-pos-chip.png`, `r12q-light.png` (hamısı PNG, 2940px en).
