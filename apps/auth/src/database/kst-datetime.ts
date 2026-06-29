import { customType, type DatetimeFsp } from 'drizzle-orm/mysql-core';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

interface KstDatetimeConfig {
  fsp?: DatetimeFsp;
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

export function formatKstDatetime(value: Date): string {
  const kst = new Date(value.getTime() + KST_OFFSET_MS);

  return [
    `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(
      kst.getUTCDate(),
    )}`,
    `${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}:${pad(
      kst.getUTCSeconds(),
    )}.${pad(kst.getUTCMilliseconds(), 3)}`,
  ].join(' ');
}

export function parseKstDatetime(value: string): Date {
  const match = value
    .trim()
    .match(
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/,
    );

  if (!match) {
    throw new Error(`Invalid KST datetime value: ${value}`);
  }

  const [, year, month, day, hour, minute, second, fraction = ''] = match;
  const milliseconds = Number(fraction.padEnd(3, '0').slice(0, 3));

  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      milliseconds,
    ) - KST_OFFSET_MS,
  );
}

export const kstDatetime = customType<{
  data: Date;
  driverData: string;
  config: KstDatetimeConfig;
}>({
  dataType(config) {
    return config?.fsp === undefined ? 'datetime' : `datetime(${config.fsp})`;
  },
  toDriver(value) {
    return formatKstDatetime(value);
  },
  fromDriver(value) {
    return parseKstDatetime(value);
  },
});
