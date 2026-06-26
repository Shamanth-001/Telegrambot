export class SourceCircuitBreaker {
  constructor(failureThreshold = 5, recoveryTimeoutMs = 60_000) {
    this.failureCount = 0;
    this.failureThreshold = failureThreshold;
    this.recoveryTimeoutMs = recoveryTimeoutMs;
    this.state = 'CLOSED';
    this.nextAttemptTs = 0;
  }

  success() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  fail() {
    this.failureCount += 1;
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTs = Date.now() + this.recoveryTimeoutMs;
    }
  }

  canRequest() {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN' && Date.now() >= this.nextAttemptTs) {
      this.state = 'HALF_OPEN';
      return true;
    }
    return this.state === 'HALF_OPEN';
  }
}


