import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { of, throwError } from 'rxjs';
import { AppModule } from './../src/app.module';
import { LogStreamerProxyService } from '../src/log-streamer-proxy/log-streamer-proxy.service';
import { PUB_SUB } from '../src/pubsub/pubsub.provider';

function createAuthUnauthorizedError(): AxiosError {
  return new AxiosError(
    'Request failed',
    'ERR_BAD_REQUEST',
    { url: 'http://localhost:4001/auth/password' } as InternalAxiosRequestConfig,
    undefined,
    {
      data: {
        message: 'Unauthorized',
        statusCode: 401,
      },
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      config: {
        url: 'http://localhost:4001/auth/password',
      } as InternalAxiosRequestConfig,
    },
  );
}

describe('Gateway GraphQL (e2e)', () => {
  let app: NestFastifyApplication;
  let httpService: {
    get: jest.Mock;
    post: jest.Mock;
    axiosRef: {
      interceptors: {
        request: { use: jest.Mock };
        response: { use: jest.Mock };
      };
    };
  };

  beforeEach(async () => {
    httpService = {
      get: jest.fn(),
      post: jest.fn(),
      axiosRef: {
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(HttpService)
      .useValue(httpService)
      .overrideProvider(LogStreamerProxyService)
      .useValue({
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
        listContainers: jest.fn(),
        getContainerStats: jest.fn(),
        subscribeToLogs: jest.fn(),
        subscribeToServiceLogs: jest.fn(),
      })
      .overrideProvider(PUB_SUB)
      .useValue({
        publish: jest.fn(),
        subscribe: jest.fn(),
        unsubscribe: jest.fn(),
        asyncIterableIterator: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('queries kiosk admin release-currency terminals with mocked downstream data', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
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
        },
      }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { 'x-api-key': 'test-api-key-1' },
      payload: {
        query: `
          query KioskTerminals($currencyCode: CurrencyCode!) {
            getReleaseCurrencyTerminals(currencyCode: $currencyCode) {
              exchangeRate
              terminalInfos {
                terminalNo
                terminalNm
                addr
                detailAddr
                lat
                lon
                operationDay
              }
            }
          }
        `,
        variables: { currencyCode: 'USD' },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.errors).toBeUndefined();
    expect(body.data.getReleaseCurrencyTerminals).toEqual({
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
    });
    expect(httpService.get).toHaveBeenCalledWith(
      'http://localhost:4004/admin-api/terminal/release-currency/USD/terminals',
    );
  });

  it('changes password publicly by forwarding Authorization to the auth service', async () => {
    httpService.post.mockReturnValue(of({ data: { success: true } }));

    const response = await app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { authorization: 'Bearer access-token' },
      payload: {
        query: `
          mutation ChangePassword($input: ChangePasswordInput!) {
            changePassword(input: $input)
          }
        `,
        variables: {
          input: {
            currentPassword: 'password123',
            newPassword: 'newpass1234',
          },
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.errors).toBeUndefined();
    expect(body.data.changePassword).toBe(true);
    expect(httpService.post).toHaveBeenCalledWith(
      'http://localhost:4001/auth/password',
      {
        currentPassword: 'password123',
        newPassword: 'newpass1234',
      },
      {
        headers: { Authorization: 'Bearer access-token' },
      },
    );
  });

  it('propagates auth-service 401 when changePassword has no Authorization header', async () => {
    httpService.post.mockReturnValue(
      throwError(() => createAuthUnauthorizedError()),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/graphql',
      payload: {
        query: `
          mutation ChangePassword($input: ChangePasswordInput!) {
            changePassword(input: $input)
          }
        `,
        variables: {
          input: {
            currentPassword: 'password123',
            newPassword: 'newpass1234',
          },
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toBeNull();
    expect(body.errors?.[0]?.message).toBe('Unauthorized');
    expect(body.errors?.[0]?.extensions).toMatchObject({
      code: 'UNAUTHENTICATED',
      statusCode: 401,
      downstreamService: 'auth',
    });
    expect(httpService.post).toHaveBeenCalledWith(
      'http://localhost:4001/auth/password',
      {
        currentPassword: 'password123',
        newPassword: 'newpass1234',
      },
      {
        headers: {},
      },
    );
  });
});
