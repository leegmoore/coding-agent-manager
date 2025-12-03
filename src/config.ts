import path from "path";
import os from "os";

export const config = {
  claudeDir: process.env.CLAUDE_DIR || path.join(os.homedir(), ".claude"),
  port: parseInt(process.env.PORT || "3000", 10),
  get projectsDir() {
    return path.join(this.claudeDir, "projects");
  },
  get lineageLogPath() {
    return path.join(this.claudeDir, "clone-lineage.log");
  },
};


