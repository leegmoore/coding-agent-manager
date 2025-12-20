import { Router } from "express";
import validate from "express-zod-safe";
import { z } from "zod";
import { getSessionSource, decodeFolderName } from "../sources/index.js";

export const sessionBrowserRouter = Router();

const FolderParamsSchema = z.object({
  folder: z.string().min(1, "Folder name is required"),
});

// GET / - Render session browser page (home)
sessionBrowserRouter.get("/", (req, res) => {
  res.render("pages/session-browser");
});

// GET /session-clone - Render clone page
sessionBrowserRouter.get("/session-clone", (req, res) => {
  res.render("pages/clone");
});

// GET /api/projects - List all projects
sessionBrowserRouter.get("/api/projects", async (req, res) => {
  try {
    const source = getSessionSource("claude");

    if (!(await source.isAvailable())) {
      return res.status(503).json({
        error: { code: "SOURCE_UNAVAILABLE", message: "Claude projects directory not found" },
      });
    }

    const projects = await source.listProjects();
    res.json({ projects });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list projects";
    console.error("[session-browser] Failed to list projects:", error);
    res.status(500).json({ error: { code: "SERVER_ERROR", message } });
  }
});

// GET /api/projects/:folder/sessions - List sessions in project
sessionBrowserRouter.get(
  "/api/projects/:folder/sessions",
  validate({ params: FolderParamsSchema }),
  async (req, res) => {
    try {
      const { folder } = req.params;
      const source = getSessionSource("claude");
      const sessions = await source.listSessions(folder);

      res.json({ folder, path: decodeFolderName(folder), sessions });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Project folder not found" } });
      }
      const message = error instanceof Error ? error.message : "Failed to list sessions";
      console.error("[session-browser] Failed to list sessions:", error);
      res.status(500).json({ error: { code: "SERVER_ERROR", message } });
    }
  }
);

const HashParamsSchema = z.object({
  hash: z.string().min(1, "Workspace hash is required")
});

// GET /api/copilot/projects - List Copilot workspaces
sessionBrowserRouter.get("/api/copilot/projects", async (req, res) => {
  try {
    const source = getSessionSource("copilot");

    if (!await source.isAvailable()) {
      return res.status(503).json({
        error: { code: "SOURCE_UNAVAILABLE", message: "VS Code workspace storage not found" }
      });
    }

    const projects = await source.listProjects();
    res.json({ projects });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list Copilot projects";
    console.error("Failed to list Copilot projects:", error);
    res.status(500).json({ error: { code: "SERVER_ERROR", message } });
  }
});

// GET /api/copilot/projects/:hash/sessions - List sessions in workspace
sessionBrowserRouter.get(
  "/api/copilot/projects/:hash/sessions",
  validate({ params: HashParamsSchema }),
  async (req, res) => {
    try {
      const { hash } = req.params;
      const source = getSessionSource("copilot");
      const sessions = await source.listSessions(hash);
      const projectPath = sessions.length > 0 ? sessions[0].projectPath : "";

      res.json({ folder: hash, path: projectPath, sessions });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Workspace not found" } });
      }
      if (error instanceof Error && error.message.includes("path traversal")) {
        return res.status(400).json({ error: { code: "INVALID_INPUT", message: error.message } });
      }
      const message = error instanceof Error ? error.message : "Failed to list Copilot sessions";
      console.error("Failed to list Copilot sessions:", error);
      res.status(500).json({ error: { code: "SERVER_ERROR", message } });
    }
  }
);
