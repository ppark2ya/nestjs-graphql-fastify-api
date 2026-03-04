import { promises as dns } from 'dns';
import { Logger } from '@nestjs/common';

const logger = new Logger('LogStreamerDiscovery');

/**
 * Docker Swarm DNS 디스커버리로 모든 log-streamer 인스턴스 IP를 반환.
 * DNS 실패 시 fallbackUrl에서 hostname을 추출하여 단일 인스턴스 fallback.
 */
export async function discoverLogStreamers(
  fallbackUrl: string,
): Promise<string[]> {
  try {
    const addresses = await dns.resolve4('tasks.log-streamer');
    logger.debug(`Discovered ${addresses.length} log-streamer instances`);
    return addresses;
  } catch {
    const url = new URL(fallbackUrl);
    return [url.hostname];
  }
}
