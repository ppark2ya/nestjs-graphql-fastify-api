import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import CircuitBreaker from 'opossum';

const DEFAULT_OPTIONS: CircuitBreaker.Options = {
  timeout: false, // Axios timeout(5000ms)에 위임, 중복 방지
  errorThresholdPercentage: 50,
  resetTimeout: 30_000,
  volumeThreshold: 5,
  rollingCountTimeout: 10_000,
};

@Injectable()
export class CircuitBreakerService {
  private readonly breakers = new Map<string, CircuitBreaker>();

  private getBreaker(domain: string): CircuitBreaker {
    let breaker = this.breakers.get(domain);
    if (!breaker) {
      breaker = new CircuitBreaker(
        (fn: () => Promise<unknown>) => fn(),
        {
          ...DEFAULT_OPTIONS,
          name: domain,
        },
      );
      this.breakers.set(domain, breaker);
    }
    return breaker;
  }

  async fire<T>(domain: string, action: () => Promise<T>): Promise<T> {
    const breaker = this.getBreaker(domain);
    try {
      return (await breaker.fire(action)) as T;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Breaker is open'
      ) {
        throw new ServiceUnavailableException(
          `Circuit breaker is open for domain: ${domain}`,
        );
      }
      throw error;
    }
  }
}
