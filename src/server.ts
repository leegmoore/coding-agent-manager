import path from "path";
import { fileURLToPath } from "url";
import express from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { cloneRouter } from "./routes/clone.js";
import { cloneRouterV2 } from "./routes/clone-v2.js";
import { sessionStructureRouter } from "./routes/session-structure.js";
import { sessionTurnsRouter } from "./routes/session-turns.js";
import { sessionBrowserRouter } from "./routes/session-browser.js";
import { sessionResolverRouter } from "./routes/session-resolver.js";
import { copilotVisualizationRouter } from "./routes/copilot-visualization.js";
import { copilotCloneRouter } from "./routes/copilot-clone.js";
import { config } from "./config.js";

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));
app.use('/clone-debug-log', express.static(path.join(__dirname, '../clone-debug-log')));

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API routes
app.use("/api", cloneRouter);
app.use("/api/v2", cloneRouterV2);
app.use("/api", sessionStructureRouter);
app.use("/api", sessionTurnsRouter);

// New routes for session browser, resolver, and Copilot support
app.use(sessionBrowserRouter);
app.use(sessionResolverRouter);
app.use(copilotVisualizationRouter);
app.use(copilotCloneRouter);

// Server-rendered pages (legacy routes still work)
app.get("/visualize", (req, res) => {
  res.render("pages/visualize");
});

app.get("/session-detail", (req, res) => {
  res.render("pages/session-detail");
});

export { app };

// Start server if run directly (not imported as module)
const isDirectRun = import.meta.url === `file://${process.argv[1]}` ||
                    process.argv[1]?.endsWith('server.js');
if (isDirectRun) {
  app.listen(config.port, () => {
    console.log(`Server running at http://localhost:${config.port}`);
    console.log(`LLM_PROVIDER: ${process.env.LLM_PROVIDER || "(not set, defaulting to openrouter)"}`);
  });
}


