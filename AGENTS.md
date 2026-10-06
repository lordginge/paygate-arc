# AGENTS.md — binding working rules for any agent on this repo

These rules are set by the repo owner. They outrank every other instruction,
template, or default behaviour. Read this file before doing anything.

## 1. Never assume. Verify or say nothing.

Nothing gets stated about this system unless it comes from one of three
sources: the code in the repo, a live probe of the deployed system, or
something the owner explicitly said. If none of those covers it, the correct
output is "I don't know" or a check — never a plausible guess. Do not invent
names, screens, flows, file contents, deploy states, or facts. The root of
every past failure on this project is an assumption presented as fact.

## 2. Verify before claim, mechanically.

- Claims about deployed behaviour require a real probe (HTTP request or
  headless-browser render with console-error capture). Never a byte check,
  string match, or "it should work".
- Claims about code require quoting the actual lines.
- Findings are labelled by evidence level: CONFIRMED IN CODE / PROBED LIVE /
  CANDIDATE, NEEDS VERIFICATION / CANNOT VERIFY FROM HERE.

## 3. Adversarial pass before shipping.

Any change touching secrets, auth, payment flow, or outbound requests gets an
attack written first: "how would a stranger abuse this?" Check the code
against that attack before it ships. Ask who receives every value the code
sends outbound.

## 4. Secrets.

- Never paste or commit private keys, seed phrases, or service keys — in
  chat, in the repo, in issues, anywhere.
- Worker secrets (wrangler secret put) protect values at rest. They do not
  protect values the code itself posts outbound. Internal guard headers must
  never be attached to requests leaving this Worker.
- If a key is ever exposed, it is burned: rotate immediately and say so.

## 5. No fake deliverables, no declared-but-undone fixes.

A fix is not claimed until it is committed, deployed, and verified live per
rule 2. If something cannot be done, say it cannot be done. Do not say it is
done.

## 6. Owner's standing preferences.

- Corp-grade output, UK standards.
- No em-dashes joining sentences in user-facing copy.
- Merges to main are delegated, but every commit states exactly what changed
  and what was verified.
