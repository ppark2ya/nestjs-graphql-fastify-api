import { Args, Query, Resolver } from '@nestjs/graphql';
import { CurrencyCode } from '../enums/currency-code.enum';
import { KioskAdminReleaseCurrencyTerminals } from './models/kiosk-admin-release-currency-terminals.model';
import { KioskAdminProxyService } from './kiosk-admin-proxy.service';

@Resolver()
export class KioskAdminProxyResolver {
  constructor(private readonly kioskAdminProxyService: KioskAdminProxyService) {}

  @Query(() => KioskAdminReleaseCurrencyTerminals, {
    description: '통화별 외화환전 가능 단말기 목록 조회',
  })
  async getReleaseCurrencyTerminals(
    @Args('currencyCode', { type: () => CurrencyCode })
    currencyCode: CurrencyCode,
  ): Promise<KioskAdminReleaseCurrencyTerminals> {
    return this.kioskAdminProxyService.getReleaseCurrencyTerminals(
      currencyCode,
    );
  }
}
