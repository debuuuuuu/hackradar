import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import react from "@vitejs/plugin-react";
import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function apiServerPlugin(): Plugin {
  return {
    name: "api-server-middleware",
    apply: "serve",
    configureServer(server) {
      if (process.env.VITEST) return;

      // Load environment variables from repo root into process.env for dev server
      const rootEnv = loadEnv("development", path.resolve(__dirname, ".."), "");
      for (const [key, value] of Object.entries(rootEnv)) {
        if (key !== "TEST_DATABASE_URL" && !process.env[key]) {
          process.env[key] = value;
        }
      }

      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (!req.url || !req.url.startsWith("/api/")) {
          return next();
        }

        try {
          const mod = (await server.ssrLoadModule("./server/router.ts")) as {
            route: (req: Request) => Promise<Response>;
          };

          const protocol = req.headers["x-forwarded-proto"] || "http";
          const host = req.headers.host || "localhost:5173";
          const fullUrl = `${protocol}://${host}${req.url}`;

          let body: Buffer | undefined;
          if (req.method !== "GET" && req.method !== "HEAD") {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
            }
            body = Buffer.concat(chunks);
          }

          const webReq = new Request(fullUrl, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: body && body.length > 0 ? new Uint8Array(body) : undefined,
          });

          const webRes = await mod.route(webReq);

          res.statusCode = webRes.status;
          webRes.headers.forEach((val, key) => {
            res.setHeader(key, val);
          });

          if (typeof webRes.headers.getSetCookie === "function") {
            const cookies = webRes.headers.getSetCookie();
            if (cookies.length > 0) {
              res.setHeader("set-cookie", cookies);
            }
          }

          const arrayBuffer = await webRes.arrayBuffer();
          res.end(Buffer.from(arrayBuffer));
        } catch (err) {
          console.error("API server middleware error:", err);
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "Internal dev server error" }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiServerPlugin()],
  test: { include: ["tests/**/*.test.ts"], testTimeout: 30000, fileParallelism: false },
});


