# SAITO — UX REVIEW OVERVIEW (2026-09-19)

**Məqsul:** manager görüşü üçün tam UX inventarı — hansı səhifələr var, nə işə
yapar, backend statusu (nə frozen/düzgün işləyir), UI statusu (yeni vizual
qaydaya uyğunmu), zəifliklər və gələcək planlar.
**Kanonik vizual qayda:** `SAITO_UI_VISUAL_DIRECTION.md` ("Empty-looking, but
never empty") — 2026-09-19 user-ratified, bütün gələcək UI işinə bağlayıcıdır.

## 1. ARXİTEKTURƏ — 4 TƏRƏF, 1 BACKEND

```
Masa üstü QR ──► GUEST WEB:  /menu?table=N · /reservation · /kitchen/track/[id]
                  (gələcəkdə əsas guest məhsul = Sushinode — xarici, öz lux frontend-i;
                   Saito /menu = draft; inteqrasiya pass-ı sonda)
POS cihazı   ──► ADMIN:      /admin/*  (26 səhifə, PIN login)
Mətbəx cihazı──► KITCHEN:    /kitchen (KDS device ekranı)
Staff mobil  ──► STAFF:      /staff/*  (PIN, növbə, mübadilə, maaş)

Hər dördü ──► Eyni Supabase backend (frozen contractlar, gate-lərlə təsdiqli)
```

Giriş: `/` → `/admin` · `/login` → `/staff/login` · superadmin PIN = 4321.

## 2. SƏHİFƏ İNVENTARI (38 səhifə)

**Legend:** Backend: 🔒 frozen+gate · ⚠️ vendor-blocked (Supabase insidenti) · ✔️ işləyir.
UI: 🆕 yeni vizual qayda ilə (09-19) · 📝 draft · 🟨 köhnə dövr dizaynı (qaydadan əvvəl — UX programına daxildir).

### Guest kanalları
| URL | İşləməsi | Backend | UI |
|---|---|---|---|
| `/menu?table=N` | Masa QR → menyu, check aç, add-to-check, kod/relink | 🔒 W-A2 19/19 (server price, check_token, code rotasiyası, D17 prod fix) | 📝 draft (09-19, yeni qayda; QR xətti DEFER — Sushinode inteqrasiya hədəfi) |
| `/reservation` | Publik rezervasiya | ✔️ (MFM §11) | 🟨 |
| `/kitchen/track/[id]` | Müştəri sifariş izləmə linki | ✔️ (KDS event spine) | 🟨 |
| `/about` · `/unauthorized` | Platform səhifələri | — | 🟨 |

### POS / Front-of-house
| URL | İşləməsi | Backend | UI |
|---|---|---|---|
| `/admin/pos` | Əsas iş stansiyası: cədvəl xaritası, cart, ödəniş, qonaq axtarışı | 🔒 O 38/38 + P-1..P-6 + F 35/35 | 🟨 operator stansı — sıxlıq funksionaldır; UX programı Faz 2 |
| `/admin/orders` | Sifariş list + detal (masa/ID axtarış, 30s poll) | 🔒 O + P-5/P-6 | 🟨 Faz 2 |
| `/admin/kds` | Mətbəx paneli (operator baxışı) | 🔒 K 8/8 + L4 16/16 | 🟨 fazasi rəng = funksionaldır |
| `/admin/tables` | Cədvəl idarəetməsi (status, xarita) | 🔒 F 35/35 | 🟨 Faz 2 |
| `/admin/history` | Satış tarixçəsi (30s poll) | ✔️ | 🟨 Faz 4 |
| `/admin/reservations` | Rezervasiya idarəetməsi | ✔️ | 🟨 Faz 4 |
| `/admin/customers` | **CRM workspace: Search → list → profile → timeline** | 🔒 W-A3 9/9 (canlı stats, dead sütun yox) | 🆕 **yeni qayda ilə (09-19)** |

### Back-office (menu + inventar)
| URL | İşləməsi | Backend | UI |
|---|---|---|---|
| `/admin/products` | Menyu CRUD (qiymət, status, allergen) | 🔒 A 39/39 | 🟨 Faz 3 |
| `/admin/combos` | Combo məhsullar | ✔️ (MFM §10) | 🟨 Faz 3 |
| `/admin/recipes` | Resept/BOM (inventar üçün) | ✔️ (MFM §18) | 🟨 Faz 3 |
| `/admin/stock` | Inventar (balans, hərəkat) | 🔒 K-L3 8/8 + L4 16/16 | 🟨 Faz 3 — **detail route 09-19-ada qırıq idi** (Next 16 async-params; fixed, probe 4/4) |
| `/admin/stock/counts` | Stok sayımı | 🔒 K-L | 🟨 Faz 3 — eyni fix |
| `/admin/stock/returns` | Təchizatçı qaytımları | 🔒 K-L | 🟨 Faz 3 — eyni fix |
| `/admin/purchase-orders` | Satınalma sifarişləri | ✔️ (MFM §17) | 🟨 Faz 3 |
| `/admin/waste-standards` | İtki standartları | ✔️ (MFM §16) | 🟨 Faz 3 |
| `/admin/loss-prevention` | İtki qoruq paneli | ✔️ (P-5 sinfi) | 🟨 Faz 4 |

### İnsan + operasiya
| URL | İşləməsi | Backend | UI |
|---|---|---|---|
| `/admin/staff` · `/admin/staff/[id]` | Staff list + profil | 🔒 A (RBAC frozen) | 🟨 Faz 3 |
| `/admin/staff/roles` | Rollar/permissions | 🔒 A + P-1 | 🟨 Faz 3 |
| `/admin/staff/shifts` · `/admin/shifts` | Smenalar (aç/bağla/hesablaşdır) | ⚠️ P-8 vendor-blocked (backend partial verified) | 🟨 Faz 3 |
| `/admin/audit` | Audit log baxışı | 🔒 (audit spine) | 🟨 Faz 4 |

### Analitika + platform
| URL | İşləməsi | Backend | UI |
|---|---|---|---|
| `/admin/stats` | Satis analitika | ✔️ (MFM §24) | 🟨 Faz 4 — dashboard syndrome əsas hədəf |
| `/admin/kitchen-analytics` | Mətbəx analitika | ✔️ | 🟨 Faz 4 |
| `/admin/campaigns` · `/admin/campaigns/analytics` | Kampaniyalar (Q2 CUT qərarı — status managerla təsdiqlənsin) | — | 🟨 |
| `/admin/settings` | Konfiqurasiya (ƏDV, xidmət, cədvəl sayı) | ✔️ | 🟨 Faz 5 |
| `/admin` | Launcher (setup yoxlaması + stats qısayolu) | — | 🟨 |

### Cihaz səhifələri
| URL | İşləməsi | Backend | UI |
|---|---|---|---|
| `/kitchen` | KDS cihaz ekranı (ticket axını) | 🔒 K + L4 | 🟨 device konteksti — sıxlıq funksionaldır |
| `/staff/login` | Staff PIN girişi (mobil) | 🔒 A | 🟨 Faz 5 |
| `/staff` · `/staff/schedule` · `/staff/swap` · `/staff/payroll` | Staff mobil öz-özünə xidmət: növbə, mübadilə, maaş | ✔️ (MFM §19/§20) | 🟨 Faz 5 |

## 3. YENİ SƏTHLƏR (09-19, yeni vizual qayda ilə)

1. **`/admin/customers`** — 🆕 Search → list (canlı stats: ziyarət · xərc · son ziyarət) → profile → timeline (date qrupları, items, ödəniş) + Sevimlilər. Demo data: **Aygün Mammadova** (`00055550101`) + **Tural Hüseynov** (`00055550202`) — review-dən sonra `.demo-cleanup.sql` ilə təmizlənir.
2. **`/menu?table=N`** — 📝 draft: sakin sticky bar (`N mövqe · ₼X → əməliyyat`), check kodu (bir dəfə panel + relink input), məcburi telefon (device memory ilə sükutla yenidən istifadə), external-check aşkarlanması.

## 4. MƏLUM UX ZƏİFLİKLƏRİ (görüş üçün)

- **Dashboard syndrome:** stats / kitchen-analytics / campaigns-analytics — card grid + metric tile zənginliyi (Faz 4 əsas hədəfi).
- **Enterprise-style cədvəllər:** stock/counts/returns, purchase-orders, waste-standards — çoxlu sütun/kontrol (Faz 3).
- **ActionSheet qonaq bloku** (POS içində) — zəif idi; yeni `/admin/customers` bunu əvəz edir (POS-da link əlavə olunacaq — Faz 2).
- **Stock detail axınları** — dynamic route 09-19-ada runtime-da qırıq idi (Next 16); indi düzəlirdir amma UX test olunmayıb (ilk dəfə işləyən axın).
- **Sıxlıq sərhədi qərarı lazımdır:** POS/KDS/operator səhifələrində sıxlıq funksionaldır — vizual qayda orada "operator variantı" ilə tətbiq olunmalıdır (qərar: görüşdə).
- **Mövcud olmayan səthlər (UI):** gift cards, daily checklists, waitlist (provider pending), customer segmentation/loyalty baxışı (timeline-də stats var, loyalty balansı ayrıca route-dan).

## 5. BACKEND ETİMALİ (UI qərarları üçün kontekst)

- **Gated (09-19 live):** A 39/39 · E/S 54/54 · F 35/35 · O 38/38 · K-L3 8/8 · K-L4 16/16 · P-9 25/25 · P-1 29/29 · P-2 13/13 · P-3 25/25 · P-4 19/19 · P-5 10/10 · P-6 15/15 · W-A1 18/18 · W-A2 19/19 · W-A3 9/9 — heç biri qırıq deyil.
- **Vendor-blocked:** P-7 half-2 + P-8 (Supabase insidenti 6q5902p2xd9f; re-run komandaları hazırdır — vendor qaytaranda).
- **Sabitlik qaydası:** UI frozen backend-i heç vaxt dəyişmir; contract mismatch olarsa UI adapt olur və ya STOP + report.

## 6. GƏLƏCƏK PLANLARI

**Növbəti (backend, avtonom):** Wave A #3 **Gift Card minimal** (backend → UI) → #4 Daily checklists → #5 Device registry / print routing.
**Son (bütün guest axını):** **Sushinode Guest Ordering Website integration pass** — menu → modifiers → cart → check → recovery code → eyni Supabase backend → POS/KDS. Saito /menu + W-A2 contractları (check_token, code/relink, server price) bu inteqrasiyanın infrastrukturudur.
**Deferred (provider/qərar gözləyir):** loyalty tiers, waitlist SMS, campaigns (Q2 CUT təsdiqi).
**UX programı (bu sənədin §2 "Faz" sütunu):** Faz 2 (POS/orders/tables + customers link) → Faz 3 (stock/BOH/staff) → Faz 4 (analitika) → Faz 5 (device/settings). Hər faz: backend toxunulmadan, UI-only, vizual qayda ilə.

## 7. MANAGER GÖRÜŞÜ ÜÇÜN AGENDA (təklif)

1. Arxitektura: 4 tərəf, 1 backend; QR = channel, guest məhsul = Sushinode (sonda inteqrasiya).
2. Nə dondurulub (frozen backend, gate-lər) — UI sərbəstdir, business logic deyil.
3. Yeni UX standart: "Empty-looking, but never empty" — Customers + Menu pilotlarına baxış.
4. Qərarlar: (a) operator səhifələrində (POS/KDS) sıxlıq sərhədi; (b) faz prioritetləri; (c) campaigns statusu; (d) gift card UX forması (backend hazırlıqkı).
5. Risklər: P-8 vendor bloku (smenalar), P-7 half-2 re-run, Supabase incident tarixçəsi.

## 8. TEZ SƏHİFƏLƏR (review üçün)

| URL | Nə görsün |
|---|---|
| `http://localhost:3000/admin/pos` | Əsas operator stansiyası |
| `http://localhost:3000/admin/customers` | 🆕 CRM workspace (demo: Aygün / Tural) |
| `http://localhost:3000/menu?table=1` | 📝 Guest check-flow draft |
| `http://localhost:3000/admin/orders` | Sifariş axını |
| `http://localhost:3000/admin/stock` | Inventar (detail axınları indi işləyir) |
| `http://localhost:3000/admin/stats` | Analitika (dashboard syndrome nümunəsi) |

Login: `http://localhost:3000/admin` → PIN **4321** (superadmin).
