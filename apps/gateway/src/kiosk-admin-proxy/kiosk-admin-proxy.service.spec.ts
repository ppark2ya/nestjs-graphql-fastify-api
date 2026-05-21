import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { of, throwError } from 'rxjs';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';
import { CurrencyCode } from '../enums/currency-code.enum';
import { KioskAdminProxyService } from './kiosk-admin-proxy.service';

function createKioskAxiosError(): AxiosError {
  return new AxiosError(
    'Request failed',
    'ERR_BAD_RESPONSE',
    {
      url: 'http://kiosk-admin:4004/terminal/release-currency/USD/terminals',
    } as InternalAxiosRequestConfig,
    undefined,
    {
      data: {
        code: 'KIOSK_404',
        message: '단말기 정보를 찾을 수 없습니다.',
        timestamp: '2026-05-21 10:00:00',
      },
      status: 404,
      statusText: 'Not Found',
      headers: {},
      config: {
        url: 'http://kiosk-admin:4004/terminal/release-currency/USD/terminals',
      } as InternalAxiosRequestConfig,
    },
  );
}

describe('KioskAdminProxyService', () => {
  let service: KioskAdminProxyService;
  let httpService: { get: jest.Mock };
  let circuitBreaker: { fire: jest.Mock };

  beforeEach(() => {
    httpService = {
      get: jest.fn(),
    };
    circuitBreaker = {
      fire: jest.fn((_domain: string, action: () => Promise<unknown>) =>
        action(),
      ),
    };

    service = new KioskAdminProxyService(
      httpService as unknown as HttpService,
      circuitBreaker as unknown as CircuitBreakerService,
      {
        getOrThrow: jest.fn().mockReturnValue('http://kiosk-admin:4004'),
      } as unknown as ConfigService,
    );
  });

  it('gets release-currency terminals from kiosk admin', async () => {
    const response = {
      exchangeRate: 1390.25,
      terminalInfos: [
        {
          terminalNo: 'T-001',
          terminalNm: 'Myeongdong Kiosk',
          addr: 'Seoul Jung-gu',
          detailAddr: '1F',
          lat: '37.563',
          lon: '126.982',
          operationDay: '09:00-18:00',
        },
      ],
    };
    httpService.get.mockReturnValue(of({ data: response }));

    await expect(
      service.getReleaseCurrencyTerminals(CurrencyCode.USD),
    ).resolves.toEqual(response);

    expect(httpService.get).toHaveBeenCalledWith(
      'http://kiosk-admin:4004/terminal/release-currency/USD/terminals',
    );
    expect(circuitBreaker.fire).toHaveBeenCalledWith(
      'kiosk-admin',
      expect.any(Function),
    );
  });

  it('throws BadGatewayException when a successful response has no data', async () => {
    httpService.get.mockReturnValue(of({ data: undefined }));

    await expect(
      service.getReleaseCurrencyTerminals(CurrencyCode.JPY),
    ).rejects.toThrow(BadGatewayException);
  });

  it('propagates downstream AxiosError without wrapping it', async () => {
    const axiosError = createKioskAxiosError();
    httpService.get.mockReturnValue(throwError(() => axiosError));

    await expect(
      service.getReleaseCurrencyTerminals(CurrencyCode.USD),
    ).rejects.toBe(axiosError);
  });
});
