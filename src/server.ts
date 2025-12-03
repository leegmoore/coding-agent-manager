import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { cloneRouter } from "./routes/clone.js";
import { config } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API routes
app.use("/api", cloneRouter);

// Server-rendered pages
app.get("/", (req, res) => {
  res.render("pages/clone");
});

export { app };

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(config.port, () => {
    console.log(`Server running at http://localhost:${config.port}`);
  });
}


