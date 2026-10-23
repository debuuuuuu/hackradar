import { addRoute, json } from "./http.js";
import { registerAdminRoutes } from "./admin-routes.js";
import { registerAuthRoutes } from "./auth-routes.js";
import { registerEventRoutes } from "./events-routes.js";
import { registerBusyRoutes } from "./busy-routes.js";
import { registerPicksRoutes } from "./picks-routes.js";
import { registerPrefsRoutes } from "./prefs-routes.js";
import { registerSavesRoutes } from "./saves-routes.js";

export * from "./http.js";

// Later tasks register their routes here the same way.
addRoute("GET", "/api/health", () => json({ ok: true }));
registerEventRoutes();
registerAuthRoutes();
registerPrefsRoutes();
registerBusyRoutes();
registerPicksRoutes();
registerSavesRoutes();
registerAdminRoutes();
