-- On-chain EIP-3009 indexer schema. Created 2026-09-23.
-- RLS enabled, no policies: reads and writes happen via the service role
-- key inside the Worker. The publishable key cannot touch either table.
--
-- indexer_cursor: resumable scan position for the Arc EIP-3009 sweep.
-- eip3009_events: one row per AuthorizationUsed event, paired with the
-- decoded USDC Transfer from the same transaction. attributed=true means
-- the tx matched the PayGate payment ledger and carries the endpoint slug.

CREATE TABLE IF NOT EXISTS public.indexer_cursor (
  id text PRIMARY KEY,
  last_block bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS public.eip3009_events (
  tx_hash text NOT NULL,
  log_index integer NOT NULL,
  block_number bigint NOT NULL,
  nonce text NOT NULL,
  payer text,
  payee text,
  value_usdc numeric,
  endpoint_slug text,
  attributed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tx_hash, log_index)
);

ALTER TABLE public.indexer_cursor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eip3009_events ENABLE ROW LEVEL SECURITY;
