import { addRoute, json } from "./http.js";
import { registerAuthRoutes } from "./auth-routes.js";
import { registerEventRoutes } from "./events-routes.js";
import { registerPrefsRoutes } from "./prefs-routes.js";

export * from "./http.js";

// Later tasks register their routes here the same way.
addRoute("GET", "/api/health", () => json({ ok: true }));
registerEventRoutes();
registerAuthRoutes();
registerPrefsRoutes();
