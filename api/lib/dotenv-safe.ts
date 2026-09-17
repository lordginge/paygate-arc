// Safe dotenv: loads .env under Node, silently no-ops in Workers/edge runtimes.
export async function loadDotenv(): Promise<void> {
  try {
    const dotenv = await import("dotenv");
    dotenv.config();
  } catch {
    // no fs/.env in this runtime; env vars come from the platform
  }
}
