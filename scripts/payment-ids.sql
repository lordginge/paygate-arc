-- Payment ledger backing the payment-identifier dedup and the public
-- verification page. Created 2026-09-23. RLS is enabled with no policies:
-- the gateway uses the service role key (bypasses RLS); the publishable
-- key can neither read nor write this table.
CREATE TABLE IF NOT EXISTS public.payment_ids (
  id text PRIMARY KEY,
  fingerprint text NOT NULL,
  endpoint_id uuid REFERENCES public.endpoints(id),
  payer_address text NOT NULL,
  tx_hash text
);
ALTER TABLE public.payment_ids ENABLE ROW LEVEL SECURITY;
