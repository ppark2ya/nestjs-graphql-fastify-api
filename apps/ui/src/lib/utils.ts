import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const KST = 'Asia/Seoul';
const DISPLAY_FORMAT = 'YYYY-MM-DD HH:mm:ss.SSS';

/**
 * 타임스탬프 문자열을 KST로 변환하여 표시.
 * - ISO 형식(Z, +00:00 등 타임존 포함): UTC/해당 타임존 → KST 변환
 * - 타임존 없는 형식(2024-01-15 10:30:45.123): 그대로 표시 (서버 로컬 시간으로 간주)
 */
export function toKST(timestamp: string | null | undefined): string {
  if (!timestamp) return '-';
  const hasTimezone = /Z|[+-]\d{2}:\d{2}|[+-]\d{4}$/.test(timestamp);
  if (hasTimezone) {
    const parsed = dayjs(timestamp).tz(KST);
    return parsed.isValid() ? parsed.format(DISPLAY_FORMAT) : timestamp;
  }
  return timestamp;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleTimeString('ko-KR', { hour12: false });
  } catch {
    return timestamp;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / 1024 ** i;
  return `${value >= 100 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, '')}${units[i]}`;
}
