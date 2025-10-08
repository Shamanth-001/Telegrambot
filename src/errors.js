export class TorrentBotError extends Error {
  constructor(message, code, source, retryable = false) {
    super(message);
    this.name = 'TorrentBotError';
    this.code = code;
    this.source = source;
    this.retryable = retryable;
    this.timestamp = new Date().toISOString();
  }
}

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}


