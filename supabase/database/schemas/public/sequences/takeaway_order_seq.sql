CREATE SEQUENCE public.takeaway_order_seq;

GRANT ALL ON SEQUENCE public.takeaway_order_seq TO anon;

GRANT ALL ON SEQUENCE public.takeaway_order_seq TO authenticated;

GRANT ALL ON SEQUENCE public.takeaway_order_seq TO service_role;