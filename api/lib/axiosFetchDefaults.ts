// Cloudflare Workers (workerd) rejects `cache: 'default'` on Request/fetch.
// axios 1.x hardcodes `cache: 'default'` in its fetch adapter
// (DEFAULT_REQUEST_OPTIONS) and only fills keys that are still undefined, so
// pre-seeding `fetchOptions.cache` with 'no-store' (the one cache mode
// workerd accepts) stops the throw before it happens.
//
// The Circle SDKs (@circle-fin/user-controlled-wallets and
// developer-controlled-wallets) call `axios.request` on the shared default
// instance, so mutating axios.defaults here fixes every Circle call in the
// Worker (email OTP, wallet init/list, signing, developer wallet ops).
//
// Must be imported before any Circle SDK module is loaded.
import axios from "axios";

axios.defaults.fetchOptions = {
  ...(axios.defaults.fetchOptions ?? {}),
  cache: "no-store",
};
