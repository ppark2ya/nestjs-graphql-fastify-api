import type { IncomingHttpHeaders } from 'http';

const HTTP_PROTOCOLS = new Set(['http:', 'https:']);

export function resolveAccessChannelOrigin(
  headers: IncomingHttpHeaders,
): string | null {
  return (
    originFromForwarded(headers) ??
    originFromHeader(headers, 'origin') ??
    originFromHeader(headers, 'referer') ??
    originFromHeader(headers, 'x-access-channel')
  );
}

function originFromForwarded(headers: IncomingHttpHeaders): string | null {
  const forwardedHost = firstCommaSeparatedHeader(headers, 'x-forwarded-host');
  if (!forwardedHost) return null;

  const protocol =
    normalizeProtocol(firstCommaSeparatedHeader(headers, 'x-forwarded-proto')) ??
    inferProtocolFromHost(forwardedHost);

  return originFromHost(forwardedHost, protocol);
}

function originFromHeader(
  headers: IncomingHttpHeaders,
  name: string,
): string | null {
  const value = headerValue(headers, name);
  return value ? normalizeOrigin(value) : null;
}

function originFromHost(host: string, protocol: string): string | null {
  if (/^https?:\/\//i.test(host)) {
    return normalizeOrigin(host);
  }
  return normalizeOrigin(`${protocol}://${host}`);
}

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (!HTTP_PROTOCOLS.has(url.protocol) || !url.hostname) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function normalizeProtocol(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'http' || normalized === 'http:') return 'http';
  if (normalized === 'https' || normalized === 'https:') return 'https';
  return null;
}

function inferProtocolFromHost(host: string): string {
  const normalized = host.toLowerCase();
  if (
    normalized.startsWith('localhost') ||
    normalized.startsWith('127.0.0.1') ||
    normalized.startsWith('[::1]') ||
    normalized === '::1'
  ) {
    return 'http';
  }
  return 'https';
}

function firstCommaSeparatedHeader(
  headers: IncomingHttpHeaders,
  name: string,
): string | undefined {
  return headerValue(headers, name)?.split(',')[0]?.trim() || undefined;
}

function headerValue(
  headers: IncomingHttpHeaders,
  name: string,
): string | undefined {
  const value = rawHeaderValue(headers, name);
  const first = Array.isArray(value) ? value[0] : value;
  const trimmed = first?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function rawHeaderValue(
  headers: IncomingHttpHeaders,
  name: string,
): string | string[] | undefined {
  const direct = headers[name] ?? headers[name.toLowerCase()];
  if (direct !== undefined) return direct;

  const normalizedName = name.toLowerCase();
  const match = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === normalizedName,
  );
  return match?.[1];
}
