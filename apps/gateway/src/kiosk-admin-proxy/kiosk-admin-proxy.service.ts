import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';
import { CurrencyCode } from '../enums/currency-code.enum';
import { Env } from '../env.schema';
import { KioskAdminReleaseCurrencyTerminals } from './models/kiosk-admin-release-currency-terminals.model';

@Injectable()
export class KioskAdminProxyService {
  private readonly kioskAdminUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly configService: ConfigService<Env>,
  ) {
    this.kioskAdminUrl = this.configService.getOrThrow('KIOSK_ADMIN_URL', {
      infer: true,
    });
  }

  async getReleaseCurrencyTerminals(
    currencyCode: CurrencyCode,
  ): Promise<KioskAdminReleaseCurrencyTerminals> {
    return this.circuitBreaker.fire('kiosk-admin', async () => {
      const res = await firstValueFrom(
        this.httpService.get<KioskAdminReleaseCurrencyTerminals>(
          `${this.kioskAdminUrl}/admin-api/terminal/release-currency/${currencyCode}/terminals`,
        ),
      );
      if (!res || typeof res.data === 'undefined') {
        throw new BadGatewayException(
          '키오스크 관리자 서버 응답이 올바르지 않습니다.',
        );
      }
      return res.data;
    });
  }
}
