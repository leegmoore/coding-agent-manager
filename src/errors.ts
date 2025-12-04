export class NotImplementedError extends Error {
  constructor(methodName: string) {
    super(`Not implemented: ${methodName}`);
    this.name = "NotImplementedError";
  }
}

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = "SessionNotFoundError";
  }
}

export class ConfigMissingError extends Error {
  constructor(configName: string) {
    super(`Required configuration missing: ${configName}`);
    this.name = "ConfigMissingError";
  }
}
