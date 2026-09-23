-- Register the 8-part builder guide as paid marketplace endpoints.
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.
-- Platform seller = treasury wallet; payouts route to the treasury.

insert into sellers (wallet_address, payout_address, display_name)
values (
  lower('0x57607f9296385571CbD8Df14D8728B7CB839743D'),
  '0x57607f9296385571CbD8Df14D8728B7CB839743D',
  'PayGate'
)
on conflict (wallet_address) do nothing;

insert into endpoints (slug, name, description, category, upstream_url, price_usdc, active, seller_id)
select g.slug, g.name, g.description, 'guide', g.upstream_url, '0.01', true, s.id
from (
  values
    ('guide-1-moving-pieces',   'Builder Guide 1: The moving pieces',        'What an x402 resource server is, and the Arc + Circle facilitator map you are building on.', '/api/data/guide/1'),
    ('guide-2-keys-and-wallet', 'Builder Guide 2: Keys and wallet',          'Payout addresses, key hygiene, and the setup that keeps revenue safe.', '/api/data/guide/2'),
    ('guide-3-the-402-challenge','Builder Guide 3: The 402 challenge',       'Returning a correct PaymentRequired on Arc, with the details that bite people.', '/api/data/guide/3'),
    ('guide-4-verify-and-settle','Builder Guide 4: Verify and settle',       'Facilitator verify/settle, failure shapes, and polling pending settlements.', '/api/data/guide/4'),
    ('guide-5-serve-and-receipt','Builder Guide 5: Serve and receipt',       'Serving the paid response and issuing receipt headers buyers can keep.', '/api/data/guide/5'),
    ('guide-6-stamp-every-fill', 'Builder Guide 6: Stamp every fill',        'Writing every settle to the PayGateStamp contract so your history is publicly verifiable.', '/api/data/guide/6'),
    ('guide-7-payment-identifier','Builder Guide 7: Payment-identifier',     'Idempotent retries for your buyers, 409 on fingerprint mismatch, and binding IDs to stamps.', '/api/data/guide/7'),
    ('guide-8-discovery-and-next','Builder Guide 8: Discovery and what is next', 'Registries, marketplace listing, batch settlement readiness, and the verification norm.', '/api/data/guide/8')
) as g(slug, name, description, upstream_url)
cross join (
  select id from sellers
  where wallet_address = lower('0x57607f9296385571CbD8Df14D8728B7CB839743D')
  limit 1
) s
on conflict (slug) do nothing;
