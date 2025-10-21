import EventEmitter from 'events';

// Advanced retry manager with circuit breaker pattern
class RetryManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      maxAttempts: 5,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitter: true,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 60000,
      ...options
    };
    
    this.circuitBreaker = {
      failures: 0,
      lastFailureTime: null,
      state: 'CLOSED' // CLOSED, OPEN, HALF_OPEN
    };
    
    this.operationStats = new Map();
  }

  // Calculate delay with exponential backoff and jitter
  calculateDelay(attempt) {
    let delay = Math.min(
      this.options.baseDelay * Math.pow(this.options.backoffMultiplier, attempt - 1),
      this.options.maxDelay
    );

    if (this.options.jitter) {
      // Add random jitter to prevent thundering herd
      const jitterAmount = delay * 0.1;
      delay += (Math.random() - 0.5) * 2 * jitterAmount;
    }

    return Math.max(0, delay);
  }

  // Check if circuit breaker allows operation
  canExecute() {
    const now = Date.now();
    
    switch (this.circuitBreaker.state) {
      case 'CLOSED':
        return true;
        
      case 'OPEN':
        if (now - this.circuitBreaker.lastFailureTime > this.options.circuitBreakerTimeout) {
          this.circuitBreaker.state = 'HALF_OPEN';
          this.emit('circuitBreaker', { state: 'HALF_OPEN' });
          return true;
        }
        return false;
        
      case 'HALF_OPEN':
        return true;
        
      default:
        return true;
    }
  }

  // Record operation result
  recordResult(success, operationName = 'default') {
    if (!this.operationStats.has(operationName)) {
      this.operationStats.set(operationName, {
        total: 0,
        successes: 0,
        failures: 0,
        lastAttempt: null,
        averageDelay: 0
      });
    }

    const stats = this.operationStats.get(operationName);
    stats.total++;
    stats.lastAttempt = new Date().toISOString();

    if (success) {
      stats.successes++;
      this.circuitBreaker.failures = Math.max(0, this.circuitBreaker.failures - 1);
      
      if (this.circuitBreaker.state === 'HALF_OPEN') {
        this.circuitBreaker.state = 'CLOSED';
        this.emit('circuitBreaker', { state: 'CLOSED' });
      }
    } else {
      stats.failures++;
      this.circuitBreaker.failures++;
      this.circuitBreaker.lastFailureTime = Date.now();
      
      if (this.circuitBreaker.failures >= this.options.circuitBreakerThreshold) {
        this.circuitBreaker.state = 'OPEN';
        this.emit('circuitBreaker', { state: 'OPEN' });
      }
    }
  }

  // Execute operation with retry logic
  async execute(operation, context = {}) {
    const operationName = context.name || 'operation';
    const startTime = Date.now();
    
    this.emit('start', { operationName, context });

    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt++) {
      // Check circuit breaker
      if (!this.canExecute()) {
        const error = new Error(`Circuit breaker is OPEN for ${operationName}`);
        this.emit('circuitBreakerBlocked', { operationName, error });
        throw error;
      }

      try {
        this.emit('attempt', { operationName, attempt, context });
        
        const result = await operation(attempt, context);
        
        // Record success
        this.recordResult(true, operationName);
        this.emit('success', { 
          operationName, 
          attempt, 
          duration: Date.now() - startTime,
          result 
        });
        
        return result;
        
      } catch (error) {
        this.emit('attemptFailed', { 
          operationName, 
          attempt, 
          error: error.message,
          context 
        });
        
        // Record failure
        this.recordResult(false, operationName);
        
        // If this is the last attempt, throw the error
        if (attempt === this.options.maxAttempts) {
          this.emit('finalFailure', { 
            operationName, 
            attempts: attempt,
            duration: Date.now() - startTime,
            error: error.message 
          });
          throw error;
        }
        
        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt);
        
        this.emit('retry', { 
          operationName, 
          attempt, 
          nextAttempt: attempt + 1,
          delay,
          context 
        });
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // Execute with timeout
  async executeWithTimeout(operation, timeoutMs = 30000, context = {}) {
    return Promise.race([
      this.execute(operation, context),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
      )
    ]);
  }

  // Execute multiple operations in parallel with retry
  async executeParallel(operations, maxConcurrency = 3) {
    const results = [];
    const executing = [];
    
    for (const operation of operations) {
      if (executing.length >= maxConcurrency) {
        await Promise.race(executing);
      }
      
      const promise = this.execute(operation.operation, operation.context)
        .then(result => ({ success: true, result, operation: operation.context }))
        .catch(error => ({ success: false, error, operation: operation.context }))
        .finally(() => {
          const index = executing.indexOf(promise);
          if (index > -1) executing.splice(index, 1);
        });
      
      executing.push(promise);
      results.push(promise);
    }
    
    return Promise.all(results);
  }

  // Get operation statistics
  getStats(operationName = null) {
    if (operationName) {
      return this.operationStats.get(operationName) || null;
    }
    
    return {
      circuitBreaker: this.circuitBreaker,
      operations: Object.fromEntries(this.operationStats),
      options: this.options
    };
  }

  // Reset circuit breaker
  resetCircuitBreaker() {
    this.circuitBreaker = {
      failures: 0,
      lastFailureTime: null,
      state: 'CLOSED'
    };
    this.emit('circuitBreakerReset');
  }

  // Reset all statistics
  resetStats() {
    this.operationStats.clear();
    this.resetCircuitBreaker();
    this.emit('statsReset');
  }

  // Create a retry wrapper for a function
  wrap(operation, context = {}) {
    return async (...args) => {
      return this.execute(async (attempt, ctx) => {
        return operation(...args, attempt, ctx);
      }, context);
    };
  }

  // Health check - test if retry manager is working
  async healthCheck() {
    try {
      await this.execute(async () => {
        return 'healthy';
      }, { name: 'healthCheck' });
      return { status: 'healthy', circuitBreaker: this.circuitBreaker.state };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }
}

// Utility function to create retry manager with common configurations
function createRetryManager(type = 'default') {
  const configs = {
    default: {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      jitter: true
    },
    aggressive: {
      maxAttempts: 5,
      baseDelay: 500,
      maxDelay: 30000,
      backoffMultiplier: 1.5,
      jitter: true,
      circuitBreakerThreshold: 3
    },
    conservative: {
      maxAttempts: 2,
      baseDelay: 2000,
      maxDelay: 5000,
      backoffMultiplier: 3,
      jitter: false,
      circuitBreakerThreshold: 2
    },
    network: {
      maxAttempts: 4,
      baseDelay: 2000,
      maxDelay: 20000,
      backoffMultiplier: 2,
      jitter: true,
      circuitBreakerThreshold: 4,
      circuitBreakerTimeout: 30000
    }
  };

  return new RetryManager(configs[type] || configs.default);
}

export { RetryManager, createRetryManager };
