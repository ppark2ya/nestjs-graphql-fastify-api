import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AxiosError, isAxiosError } from 'axios';
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

  private isStructuredDownstreamError(error: unknown): boolean {
    const axiosError = this.findAxiosErrorWithResponse(error);
    if (!axiosError) {
      return false;
    }

    const data = this.parseErrorData(axiosError.response?.data);
    return Boolean(data.code && data.message);
  }

  private findAxiosErrorWithResponse(error: unknown): AxiosError | null {
    let current = error;
    let fallback: AxiosError | null = null;

    while (isAxiosError(current)) {
      fallback = current;
      if (current.response) {
        return current;
      }
      current = current.cause;
    }

    return fallback;
  }

  private parseErrorData(data: unknown): { code?: string; message?: string } {
    if (typeof data === 'string') {
      try {
        return this.parseErrorData(JSON.parse(data));
      } catch {
        return {};
      }
    }

    if (!data || typeof data !== 'object') {
      return {};
    }

    const record = data as Record<string, unknown>;
    return {
      code:
        typeof record.errorCode === 'string'
          ? record.errorCode
          : typeof record.code === 'string'
            ? record.code
            : undefined,
      message: typeof record.message === 'string' ? record.message : undefined,
    };
  }

  private getBreaker(domain: string): CircuitBreaker {
    let breaker = this.breakers.get(domain);
    if (!breaker) {
      breaker = new CircuitBreaker((fn: () => Promise<unknown>) => fn(), {
        ...DEFAULT_OPTIONS,
        name: domain,
        errorFilter: (error) => this.isStructuredDownstreamError(error),
      });
      this.breakers.set(domain, breaker);
    }
    return breaker;
  }

  async fire<T>(domain: string, action: () => Promise<T>): Promise<T> {
    const breaker = this.getBreaker(domain);
    try {
      return (await breaker.fire(action)) as T;
    } catch (error) {
      if (error instanceof Error && error.message === 'Breaker is open') {
        throw new ServiceUnavailableException(
          `Circuit breaker is open for domain: ${domain}`,
        );
      }
      throw error;
    }
  }
}
