# SAITO Premium - Developer Quick Reference

## 🎯 Golden Rules (Memorize These)

```
1. "Remove every UI element that does not directly help users complete tasks faster"
2. 90% neutrals, 8% blue accent, 2% status colors
3. 8px base spacing scale - NEVER random numbers
4. If you're adding something, you should be deleting something else
5. Zero gradients, zero glassmorphism, zero neon
```

## 🎨 Color Palette (Copy-Paste Ready)

```tsx
// Backgrounds
'bg-gray-50'      // #F8F9FB - Primary
'bg-white'        // #FFFFFF - Secondary
'bg-gray-100'     // #F3F4F6 - Hover states

// Text
'text-gray-900'   // #111827 - Primary
'text-gray-700'   // #374151 - Secondary
'text-gray-600'   // #4B5563 - Muted
'text-gray-500'   // #6B7280 - Lighter

// Accent
'bg-blue-600'     // #2563EB - Primary
'hover:bg-blue-700'
'focus:ring-blue-500'
'text-blue-600'

// Status (ONLY for status)
'text-green-600'  // Success
'text-amber-600'  // Warning
'text-red-600'    // Danger
```

## 📏 Spacing Scale

```tsx
// NEVER use arbitrary padding/margins
'p-1'   // 4px
'p-2'   // 8px   ← Most common
'p-3'   // 12px
'p-4'   // 16px  ← Common
'p-6'   // 24px  ← Card padding
'p-8'   // 32px  ← Section gap
'p-12'  // 48px  ← Large gap

// Gaps between items
'gap-2'  // 8px   - Fields in form
'gap-4'  // 16px  - Section items
'gap-6'  // 24px  - Cards
'gap-8'  // 32px  - Major sections
```

## 🔘 Button Recipe

```tsx
// Primary
<Button variant="primary" size="md">
  Action Label
</Button>

// Secondary (outline)
<Button variant="secondary" size="md">
  Cancel
</Button>

// Ghost (subtle)
<Button variant="ghost">
  More Options
</Button>

// Danger (red)
<Button variant="danger">
  Delete Item
</Button>

// Sizes: sm, md, lg
// Heights: 36px, 44px, 52px respectively
```

## 📦 Card Recipe

```tsx
<Card>
  <h3 className="text-base font-semibold text-gray-900">
    Card Title
  </h3>
  <p className="text-sm text-gray-600 mt-2">
    Content goes here
  </p>
</Card>

// ALWAYS use padding 24px (built-in)
// Border radius: 18px (built-in)
// Shadow: subtle (built-in)
```

## 📊 Metric Card Recipe (Dashboard)

```tsx
<MetricCard
  label="Revenue"
  value="$12,450"
  trend={{ direction: 'up', percentage: 12 }}
  context="vs yesterday"
/>
```

## 🏷️ Badge Recipe

```tsx
<Badge variant="default">Default</Badge>
<Badge variant="success">✓ Success</Badge>
<Badge variant="warning">⚠ Warning</Badge>
<Badge variant="danger">✗ Danger</Badge>
<Badge variant="info">ℹ Info</Badge>
```

## 📝 Input Recipe

```tsx
<Input
  label="Email Address"
  type="email"
  placeholder="user@example.com"
  error={error ? "Invalid email" : undefined}
  helperText="We'll never share your email"
/>

// Height: 44px (built-in)
// Radius: 12px (built-in)
// Focus ring: 2px blue (built-in)
```

## 📋 Table Recipe

```tsx
<Table
  columns={[
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
  ]}
  data={data}
  renderRow={(row) => (
    <>
      <td className="px-4 py-3">{row.name}</td>
      <td className="px-4 py-3">{row.email}</td>
    </>
  )}
/>

// Row height: 48px
// Header bg: #F9FAFB
// Hover: #F9FAFB
// Border: #E5E7EB
```

## 📱 Page Layout Template

```tsx
'use client';
import { Button, Card, Badge } from '@/components/premium/PremiumComponents';

export function PremiumPageName() {
  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      {/* ━━ HEADER ━━ */}
      <header className="bg-white border-b border-gray-200 px-8 py-6">
        <h1 className="text-2xl font-semibold text-gray-900">
          Page Title
        </h1>
        {/* Stats, search, quick actions */}
      </header>

      {/* ━━ MAIN CONTENT ━━ */}
      <main className="flex-1 overflow-y-auto px-8 py-8 space-y-8">
        {/* Sections with gap-8 between them */}
        
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Section Title
          </h2>
          {/* Content */}
        </section>
      </main>
    </div>
  );
}
```

## 🎬 Animation Pattern

```tsx
import { motion, AnimatePresence } from 'framer-motion';

// List items
<AnimatePresence>
  {items.map((item) => (
    <motion.div
      key={item.id}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.2 }}
    >
      {/* Item */}
    </motion.div>
  ))}
</AnimatePresence>

// Hover effects
<motion.button
  whileHover={{ y: -2 }}
  whileTap={{ scale: 0.98 }}
>
  Click Me
</motion.button>

// Duration: 150-250ms (0.15-0.25)
// NO bouncing
// NO delays
```

## ❌ Never Do This

```tsx
// ❌ Random colors
<div className="bg-purple-500 text-pink-300">Bad</div>

// ❌ Random spacing
<div className="p-7 m-11 gap-5">Bad</div>

// ❌ Gradient
<div className="bg-gradient-to-r from-blue-500 to-purple-500">Bad</div>

// ❌ Glassmorphism
<div className="bg-white/20 backdrop-blur-md">Bad</div>

// ❌ Multiple accent colors
<button className="bg-blue-600">Primary</button>
<button className="bg-purple-600">No! Use secondary variant</button>

// ❌ Neon colors
<div className="text-neon-green">Bad</div>

// ❌ Rounded full for everything
<button className="rounded-full">Usually wrong</button>

// ❌ Heavy shadows
<div className="shadow-2xl drop-shadow-lg">Bad</div>

// ❌ Cram information
<Card>Too many metrics, charts, buttons, stats, info</Card>

// ❌ Slow animations
<motion.div transition={{ duration: 1 }}>Too slow</motion.div>
```

## ✅ Do This Instead

```tsx
// ✅ Use palette colors
<div className="bg-blue-600 text-gray-900">Good</div>

// ✅ Use 8px scale
<div className="p-4 m-2 gap-3">Good</div>

// ✅ Flat design
<div className="bg-white border border-gray-200">Good</div>

// ✅ Subtle shadows (or none)
<div className="shadow-sm">Good</div>

// ✅ Single accent color
<button className="bg-blue-600">Primary</button>
<button className="bg-white border">Secondary</button>

// ✅ Professional colors
<div className="text-gray-700">Good</div>

// ✅ Appropriate radius
<button className="rounded-md">12px</button>
<div className="rounded-lg">18px</div>

// ✅ Generous spacing
<Card className="p-6">Content with breathing room</Card>

// ✅ Fast animations
<motion.div transition={{ duration: 0.2 }}>Quick and smooth</motion.div>
```

## 🔍 Self-Checklist Before Committing

- [ ] Does every element help users complete a task faster?
- [ ] No random colors outside palette?
- [ ] Using 8px scale only?
- [ ] No gradients?
- [ ] No glassmorphism?
- [ ] Animations < 250ms?
- [ ] 90/8/2 color ratio?
- [ ] Cards properly spaced?
- [ ] Focus states visible?
- [ ] Mobile responsive?
- [ ] Proper hierarchy (sizes)?
- [ ] Could anything be removed?

## 📚 Reference Files

- `DESIGN_SYSTEM.md` - Complete specs
- `PREMIUM_REDESIGN_GUIDE.md` - Strategy & roadmap  
- `PREMIUM_REDESIGN_COMPLETE.md` - Full documentation
- `src/components/premium/PremiumComponents.tsx` - Copy components from here

## 🆘 When You're Stuck

**Q: Should I use this color?**
A: Only if it's in the palette. Otherwise no.

**Q: How much padding?**
A: Use 8px scale: p-2, p-4, p-6, p-8, etc.

**Q: Should I add this feature?**
A: Only if it helps users complete a task faster. Else delete it.

**Q: How long should animation be?**
A: 150-250ms. Use `duration: 0.2`

**Q: Can I use a gradient?**
A: No.

**Q: Can I use glassmorphism?**
A: No.

**Q: Why is my button round?**
A: It shouldn't be. Use `rounded-md` (12px) max.

**Q: Should I color this icon?**
A: Only if it's: active, selected, or status. Else use gray-400.

---

**Golden Rule**: When in doubt, delete it. Simplicity > Complexity.

**Remember**: You're building the Stripe/Apple/Linear of restaurant software. Every detail matters.
