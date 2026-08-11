-- Fix sessions.user_id FK: the app's staff-login flow stores STAFF ids, but the
-- constraint pointed at admin_users(id), so every staff login failed with FK 23503.
-- Repoint the FK to public.staff(id) and clear the old admin_users-based sessions.
-- Also set real PIN hashes for staff (were placeholder "dummy" values).

-- 1. Remove old sessions (they reference admin_users ids that don't exist in staff)
DELETE FROM public.sessions;

-- 2. Repoint FK
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_user_id_fkey;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.staff(id) ON DELETE CASCADE;

-- 3. Real PINs for staff accounts
--    Admin (superadmin) -> 1234
--    Kassir (cashier)    -> 5678
--    Ofisiant (waiter)   -> 0000
UPDATE public.staff SET pin_hash = 'pbkdf2_sha256$260000$3c375297e050871b2743ef0e7e59bed9$7f5767d40a80db7552a1c02ef2e04647702397fa02a6c25496c3c11fbdcb05d71fa7660a27ab63aae4089edcece9f036fe0cf069be2f1b9ce3c997786dfce155'
  WHERE id = '4e25370a-66cf-4362-ad72-95e8e892355d';
UPDATE public.staff SET pin_hash = 'pbkdf2_sha256$260000$748539ba4b20b3b26dcbd2bec3bc5976$a8c335d3503645c98b8cbc0e119c367c2ef77eb4373c5f07e9be87610e05944857543fd5d59e7b80a382bba074c635dd5420839430549253d5ff85125aadd79b'
  WHERE id = '96baaa16-8779-4d1d-a500-a3ce9084810e';
UPDATE public.staff SET pin_hash = 'pbkdf2_sha256$260000$bd01cef325d67e1e0c47f9a7efd140cc$ec9ebf154fe145efe81822286ab82f8fee70284851fcf4f7e26ccf452314df7e02ca9481748cc2929384178aaf2d864c87823dcc785b8c87231b5c84c35bb63a'
  WHERE id = 'bc2cda50-7336-407e-8540-5b5896126372';
