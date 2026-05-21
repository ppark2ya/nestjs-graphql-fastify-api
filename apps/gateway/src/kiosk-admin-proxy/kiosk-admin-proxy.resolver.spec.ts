import { CurrencyCode } from '../enums/currency-code.enum';
import { KioskAdminProxyResolver } from './kiosk-admin-proxy.resolver';
import { KioskAdminProxyService } from './kiosk-admin-proxy.service';

describe('KioskAdminProxyResolver', () => {
  let resolver: KioskAdminProxyResolver;
  let mockService: jest.Mocked<
    Pick<KioskAdminProxyService, 'getReleaseCurrencyTerminals'>
  >;

  beforeEach(() => {
    mockService = {
      getReleaseCurrencyTerminals: jest.fn(),
    };
    resolver = new KioskAdminProxyResolver(
      mockService as unknown as KioskAdminProxyService,
    );
  });

  it('passes currencyCode to service and returns release-currency terminals', async () => {
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
    mockService.getReleaseCurrencyTerminals.mockResolvedValue(response);

    await expect(
      resolver.kioskAdminReleaseCurrencyTerminals(CurrencyCode.USD),
    ).resolves.toEqual(response);

    expect(mockService.getReleaseCurrencyTerminals).toHaveBeenCalledWith(
      CurrencyCode.USD,
    );
  });
});
