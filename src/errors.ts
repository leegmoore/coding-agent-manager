export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`${method} is not implemented`);
    this.name = "NotImplementedError";
  }
}

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = "SessionNotFoundError";
  }
}


