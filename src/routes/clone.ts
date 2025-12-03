import { Router } from "express";
import validate from "express-zod-safe";
import { CloneRequestSchema } from "../schemas/clone.js";
import { cloneSession } from "../services/session-clone.js";
import { SessionNotFoundError, NotImplementedError } from "../errors.js";

export const cloneRouter = Router();

cloneRouter.post(
  "/clone",
  validate({ body: CloneRequestSchema }),
  async (req, res) => {
    try {
      const result = await cloneSession(req.body);
      res.json(result);
    } catch (err) {
      if (err instanceof SessionNotFoundError) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: err.message } });
      }
      if (err instanceof NotImplementedError) {
        return res.status(501).json({ error: { code: "NOT_IMPLEMENTED", message: err.message } });
      }
      const message = err instanceof Error ? err.message : "Internal server error";
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message } });
    }
  }
);

