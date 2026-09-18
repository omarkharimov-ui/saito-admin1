-- P-9 M1-R1 ROLLBACK — restore the pre-existing vestigial grant
-- (authenticated had SELECT=r on reservation_preorder_items before M1-R1).
GRANT SELECT ON public.reservation_preorder_items TO authenticated;
