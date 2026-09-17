// Node production entry: serves the built frontend and starts the server.
import { serve } from "@hono/node-server";
import { serveStaticFiles } from "./lib/vite";
import app from "./boot";

serveStaticFiles(app as never);

const port = parseInt(process.env.PORT || "3000");
serve({ fetch: app.fetch, port }, () => {
  console.log(`Server running on http://localhost:${port}/`);
});
