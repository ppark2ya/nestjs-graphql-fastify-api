import { LoginHistoryService } from './login-history.service';
import { tbAccount, tbLoginHistory } from '../database/schema';

describe('LoginHistoryService', () => {
  const account = {
    id: 7,
    loginId: Buffer.from('admin'),
    status: 'ACTIVE',
  } as typeof tbAccount.$inferSelect;

  function createService() {
    const updateSet = jest.fn().mockReturnThis();
    const updateWhere = jest.fn();
    const insertValues = jest.fn();

    const tx = {
      update: jest.fn(() => ({
        set: updateSet,
        where: updateWhere,
      })),
      insert: jest.fn(() => ({
        values: insertValues,
      })),
    };

    const db = {
      transaction: jest.fn(async (callback) => callback(tx)),
      insert: jest.fn(() => ({
        values: insertValues,
      })),
    };

    return {
      service: new LoginHistoryService(db as never),
      db,
      tx,
      updateSet,
      insertValues,
    };
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses schema KST conversion for successful loginAt and lastLoginAt dates', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-29T00:00:00.123Z'));
    const { service, updateSet, insertValues } = createService();

    await service.recordSuccess(account, {
      clientIp: '203.0.113.10',
      accessChannel: 'https://abc.mx-dozn.co.kr',
    });

    const accountPatch = updateSet.mock.calls[0][0];
    const historyValues = insertValues.mock.calls[0][0];

    expect(tbAccount.lastLoginAt.mapToDriverValue(accountPatch.lastLoginAt)).toBe(
      '2026-06-29 09:00:00.123',
    );
    expect(tbLoginHistory.loginAt.mapToDriverValue(historyValues.loginAt)).toBe(
      '2026-06-29 09:00:00.123',
    );
  });

  it('uses schema KST conversion for failed login failedAt dates', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-29T00:00:00.123Z'));
    const { service, insertValues } = createService();

    await service.recordFailure(
      account,
      {
        clientIp: '203.0.113.10',
        accessChannel: 'https://abc.mx-dozn.co.kr',
      },
      3,
      'ACTIVE',
    );

    const historyValues = insertValues.mock.calls[0][0];

    expect(tbLoginHistory.failedAt.mapToDriverValue(historyValues.failedAt)).toBe(
      '2026-06-29 09:00:00.123',
    );
  });
});
