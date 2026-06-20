# SAITO Admin — Restaurant Management System

Full-featured restaurant administration panel built with **Next.js 16**, **Supabase**, and **Groq AI**. Covers inventory, recipes, POS, orders, procurement, kitchen display, and analytics.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Database | Supabase (PostgreSQL + Realtime) |
| Auth | Supabase Auth + cookie-based role guard |
| AI | Groq (llama-3.3-70b-versatile) |
| UI | Tailwind CSS 4 + Framer Motion |
| Icons | Lucide React |
| Charts | Recharts |
| Fonts | Geist (Inter-like) + Playfair Display |
| PWA | Manifest + Service Worker |

## Folder Structure

```
src/
├── app/
│   ├── (admin)/         # Admin panel — stock, recipes, orders, products, stats, POS
│   │   ├── orders/      # Order management, WaiterMode POS, table grid
│   │   ├── products/    # Product CRUD, category management
│   │   ├── recipes/     # Recipe constructor with cost analysis
│   │   ├── stats/       # Dashboard, analytics, charts
│   │   ├── stock/       # Inventory table, procurement, calibration, AI insights
│   │   └── ...          # Tables, waste-standards, combos, campaigns
│   ├── api/             # API routes (inventory, orders, auth, procurement, recipes)
│   ├── kitchen/         # Kitchen Display System (KDS) — realtime order board
│   ├── about/           # Public about page
│   ├── audit/           # Public audit/safety page
│   ├── login/           # Separate login page
│   └── reservation/     # Public reservation page
├── components/          # Shared UI components (GlassCard, ErrorBoundary, etc.)
├── context/             # Legacy contexts (deprecated — use @/lib instead)
├── hooks/               # Shared hooks (useCrossTableRefresh, etc.)
├── lib/
│   ├── i18n/            # Internationalization (az/en/ru)
│   ├── theme/           # Theme context
│   ├── stockAutomation.ts  # POS → Stock deduction engine
│   ├── supabase.ts      # Supabase client
│   ├── groq.ts          # Groq AI client
│   └── toast.ts         # Toast system wrapper
├── styles/              # Global CSS
└── types/               # TypeScript types
```

## Setup

### 1. Prerequisites

- Node.js >= 20
- npm
- Supabase project (free tier works)
- Groq API key (free)

### 2. Install

```bash
git clone <repo-url>
cd saito-admin1
npm install
```

### 3. Environment Variables

Copy `.env.template` to `.env.local` and fill in:

```bash
cp .env.template .env.local
```

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (stock deduction, server-side ops) |
| `GROQ_API_KEY` | Yes | Groq API key for AI features |
| `OPENWEATHER_API_KEY` | No | Weather data for Sensei correlator |
| `GMAIL_USER` | No | SMTP email for verification codes |
| `GMAIL_APP_PASSWORD` | No | SMTP app password |

### 4. Supabase Setup

Create these tables in your Supabase project:

**Core:**
- `admin_users` — `id (uuid PK)`, `email`, `role (admin|superadmin|kitchen)`, `is_active`
- `ingredients` — `id (uuid PK)`, `name`, `unit (gram|ml|piece)`, `current_stock`, `theoretical_stock`, `min_stock`, `purchase_price`, `average_cost_per_unit`, `cold_waste_percentage`, `category`
- `products` — `id (uuid PK)`, `name`, `price`, `category_id`, `is_ready_product`, `direct_ingredient_id`, `has_active_recipe`
- `recipes` — `id (uuid PK)`, `menu_item_id (FK→products)`, `ingredient_id (FK→ingredients)`, `quantity_required`, `quantity_brutto`, `hot_waste_percentage`, `is_ai_suggested`

**Orders:**
- `orders` — `id (uuid PK)`, `table_number`, `status (confirmed|paid|cancelled)`, `kitchen_status`, `total_amount`, `paid_amount`, `payment_method`, `merged_into`, `is_served`
- `order_items` — `id (uuid PK)`, `order_id (FK→orders)`, `product_id (FK→products)`, `quantity`, `product_name`, `kitchen_status`

**Inventory:**
- `inventory_logs` — `id (uuid PK)`, `ingredient_id (FK→ingredients)`, `type (stock_in|waste|adjustment|order_consumption)`, `quantity`, `cost_per_unit`, `reason`, `created_at`
- Database trigger: on INSERT to `inventory_logs`, update `ingredients.current_stock` accordingly

**Other:**
- `suppliers`, `purchase_orders`, `procurement_reviews`, `waste_standards`, `settings`, `categories`, `tables`, `combos`, `campaigns`, `discrepancies`

### 5. Run

```bash
npm run dev
# or
npm run dev:clean  # Reset .next cache
```

Open [http://localhost:3000](http://localhost:3000).

## Key Routes

| Route | Description | Auth |
|---|---|---|
| `/` | Landing page with table grid (POS) | Cookie-based session |
| `/login` | Admin login | Public |
| `/admin/stock` | Inventory management | admin/superadmin |
| `/admin/orders` | Order list + WaiterMode POS | admin/superadmin |
| `/admin/recipes` | Recipe constructor with cost/margin analysis | admin/superadmin |
| `/admin/products` | Product catalog + recipe linkage | admin/superadmin |
| `/admin/stats` | Dashboard, analytics, Sensei | admin/superadmin |
| `/admin/tables` | Table management | admin/superadmin |
| `/kitchen` | Kitchen Display System (realtime) | kitchen/superadmin |
| `/api/*` | REST API routes | Varies |

## Architecture

### Data Flow

```
POS Payment
    → deductStockForOrder()
    → recipes lookup (ingredient_id + quantity)
    → inventory_logs INSERT
    → DB trigger updates ingredients.current_stock
    → Realtime notification → Stock page auto-refresh
```

### AI Features (Groq)

- **Sensei Chat** — `/api/sensei/chat` — Business advice
- **Recipe Suggestions** — `/api/recipes/ai-suggest` — Auto-generate recipes from product names
- **Margin Analysis** — `/api/recipes/margin-analysis` — Profitability per dish
- **Calibration** — `/api/inventory/calibration` — Detect stock/theoretical mismatches
- **Stock Insights** — `/api/stock/ai-insights` — Anomaly detection, procurement tips
- **OCR Ingredient Matching** — `/api/procurement/match-ingredient` — Invoice line → ingredient

### Realtime Subscriptions

| Page | Tables Watched | Fallback Polling |
|---|---|---|
| Stock | `inventory_logs`, `ingredients`, `orders` | 30s |
| Orders | `orders`, `order_items`, `ingredients`, `products` | 10s |
| Kitchen | `orders`, `order_items` | 30s |
| Products | `recipes`, `ingredients` via `useCrossTableRefresh` | — |

## Build & Deploy

```bash
npm run build
npm start
```

Deploy to Vercel:

```bash
npm i -g vercel
vercel
```

Environment variables must be configured in Vercel dashboard (same as `.env.local`).

## Security

- **Middleware** (`/middleware.ts`): Guards `/admin/*` and `/kitchen/*` routes via `saito_role` cookie
- **Auth flow**: Supabase session + cookie sync via `useAdminAuth` hook
- **Service role**: `SUPABASE_SERVICE_ROLE_KEY` used only server-side (API routes, stock deduction)
- **Row-Level Security**: Supabase RLS policies protect direct table access

## Naming

| Context | Name |
|---|---|
| Project | `saito-admin1` |
| Display | SAITO Admin |
| Domain | saito.az (restaurant brand) |

## Maintenance

- Keep `.env.local` out of version control
- Run `tsc --noEmit` before push to check types
- ESLint: `npm run lint`
- For clean rebuild: `npm run dev:clean`
