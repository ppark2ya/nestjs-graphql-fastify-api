import { mysqlTable } from 'drizzle-orm/mysql-core';
import { kstDatetime } from './kst-datetime';

describe('kstDatetime', () => {
  const table = mysqlTable('test_kst_datetime', {
    occurredAt: kstDatetime('occurred_at', { fsp: 6 }),
  });

  it('serializes Date values as Asia/Seoul wall-clock datetime strings', () => {
    const value = new Date('2026-06-29T00:00:00.123Z');

    expect(table.occurredAt.mapToDriverValue(value)).toBe(
      '2026-06-29 09:00:00.123',
    );
  });

  it('parses database datetime strings as Asia/Seoul time', () => {
    expect(
      table.occurredAt
        .mapFromDriverValue('2026-06-29 09:00:00.123')
        .toISOString(),
    ).toBe('2026-06-29T00:00:00.123Z');
  });

  it('keeps the existing datetime precision in the SQL type', () => {
    expect(table.occurredAt.getSQLType()).toBe('datetime(6)');
  });
});
