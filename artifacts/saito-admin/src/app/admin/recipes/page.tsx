'use client';

// 13g (owner: "reseptler ayri sehife edek, evvelki kimi"): recipes is a
// STANDALONE sidebar page again (menu-engine / BOM — conceptually distinct
// from stock & procurement operations). The body lives in
// ./recipes-content.tsx (shared so it can also be unit-tested / reused);
// 13f moved it out of the Stok hub permanently.
import RecipesPage from './recipes-content';

export default function RecipesRoute() {
  return <RecipesPage />;
}
