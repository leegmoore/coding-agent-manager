/**
 * Session file discovery and loading
 */

import { readFile, writeFile, readdir, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { SessionEntry } from './types.js';
import { parseSession, serializeSession } from './parser.js';

/**
 * Get Claude projects directory
 */
export function getProjectsDir(): string {
  return process.env.CLAUDE_DIR
    ? join(process.env.CLAUDE_DIR, 'projects')
    : join(homedir(), '.claude', 'projects');
}

/**
 * Find session file by searching all project directories
 */
export async function findSessionFile(sessionId: string): Promise<string> {
  const projectsDir = getProjectsDir();

  try {
    const projectDirs = await readdir(projectsDir, { withFileTypes: true });

    for (const dir of projectDirs) {
      if (!dir.isDirectory()) continue;

      const projectPath = join(projectsDir, dir.name);
      const sessionFile = join(projectPath, `${sessionId}.jsonl`);

      try {
        await stat(sessionFile);
        return sessionFile;
      } catch {
        continue;
      }
    }

    throw new Error(`Session not found: ${sessionId}\nSearched in: ${projectsDir}`);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Session not found')) {
      throw err;
    }
    throw new Error(`Session not found: ${sessionId}\nSearched in: ${projectsDir}`);
  }
}

/**
 * Load and parse a session file
 */
export async function loadSession(sessionId: string): Promise<{
  entries: SessionEntry[];
  path: string;
  lastModified: string;
}> {
  const sessionPath = await findSessionFile(sessionId);
  const content = await readFile(sessionPath, 'utf-8');
  const stats = await stat(sessionPath);
  const entries = parseSession(content);

  return {
    entries,
    path: sessionPath,
    lastModified: stats.mtime.toISOString(),
  };
}

/**
 * Write a session to disk
 */
export async function writeSession(
  entries: SessionEntry[],
  sourceDir: string,
  newSessionId: string
): Promise<string> {
  const outputPath = join(sourceDir, `${newSessionId}.jsonl`);
  const content = serializeSession(entries);
  await writeFile(outputPath, content, 'utf-8');
  return outputPath;
}

/**
 * Get session file metadata without loading content
 */
export async function getSessionMeta(sessionId: string): Promise<{
  path: string;
  size: number;
  lastModified: string;
}> {
  const sessionPath = await findSessionFile(sessionId);
  const stats = await stat(sessionPath);

  return {
    path: sessionPath,
    size: stats.size,
    lastModified: stats.mtime.toISOString(),
  };
}
