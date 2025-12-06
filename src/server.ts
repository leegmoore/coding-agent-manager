import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables from .env.local (fallback to .env)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env.local") });
dotenv.config({ path: path.join(__dirname, "../.env") });

import express from "express";
import { cloneRouter } from "./routes/clone.js";
import { cloneRouterV2 } from "./routes/clone-v2.js";
import { sessionStructureRouter } from "./routes/session-structure.js";
import { sessionTurnsRouter } from "./routes/session-turns.js";
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

// Server-rendered pages
app.get("/", (req, res) => {
  res.render("pages/clone");
});

app.get("/visualize", (req, res) => {
  res.render("pages/visualize");
});

app.get("/session-detail", (req, res) => {
  res.render("pages/session-detail");
});

export { app };

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(config.port, () => {
    console.log(`Server running at http://localhost:${config.port}`);
  });
}


