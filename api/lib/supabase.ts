// Minimal Supabase REST client (PostgREST) using the publishable key.
// RLS policies on the paygate-arc project gate what this key can do.

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://xdsgayetciytzopnzjab.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_KEY ?? "sb_publishable_X5xs9SvcCHuD3-KGpeBO_w_lre-Kp2E";

function headers(extra?: Record<string, string>) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export async function sbSelect<T = unknown>(
  table: string,
  query: string,
): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: headers(),
  });
  if (!res.ok) {
    throw new Error(`Supabase select ${table} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T[];
}

export async function sbInsert<T = Record<string, unknown>>(
  table: string,
  row: T,
): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new Error(`Supabase insert ${table} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T[];
}

export async function sbUpsert<T = Record<string, unknown>>(
  table: string,
  row: T,
  onConflict: string,
): Promise<T[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`,
    {
      method: "POST",
      headers: headers({
        Prefer: "return=representation,resolution=merge-duplicates",
      }),
      body: JSON.stringify(row),
    },
  );
  if (!res.ok) {
    throw new Error(`Supabase upsert ${table} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T[];
}
