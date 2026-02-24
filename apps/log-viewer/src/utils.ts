export function formatTime(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleTimeString('ko-KR', { hour12: false });
  } catch {
    return timestamp;
  }
}
