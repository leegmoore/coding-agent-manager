import { Router } from "express";
import validate from "express-zod-safe";
import { CloneRequestSchemaV2 } from "../schemas/clone-v2.js";
import { cloneSessionV2 } from "../services/session-clone.js";
import { SessionNotFoundError, NotImplementedError, ConfigMissingError } from "../errors.js";

export const cloneRouterV2 = Router();

cloneRouterV2.post(
  "/clone",
  validate({ body: CloneRequestSchemaV2 }),
  async (req, res) => {
    try {
      const result = await cloneSessionV2(req.body);
      res.json(result);
    } catch (err) {
      if (err instanceof SessionNotFoundError) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: err.message } });
      }
      if (err instanceof NotImplementedError) {
        return res.status(501).json({ error: { code: "NOT_IMPLEMENTED", message: err.message } });
      }
      if (err instanceof ConfigMissingError) {
        return res.status(500).json({ error: { code: "CONFIG_MISSING", message: err.message } });
      }
      const message = err instanceof Error ? err.message : "Internal server error";
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message } });
    }
  }
);
