type GraphQlErrorLike = {
  message?: string;
};

type ApolloErrorLike = {
  message?: string;
  errors?: GraphQlErrorLike[];
  graphQLErrors?: GraphQlErrorLike[];
  networkError?: {
    message?: string;
    result?: {
      errors?: GraphQlErrorLike[];
    };
  };
};

const TECHNICAL_ERROR_PATTERNS = [
  /data.*undefined/i,
  /cannot read properties/i,
  /backend service error/i,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function firstMessage(errors: unknown): string | undefined {
  if (!Array.isArray(errors)) {
    return undefined;
  }

  return errors.find(
    (error): error is GraphQlErrorLike =>
      isRecord(error) && typeof error.message === 'string',
  )?.message;
}

function sanitizeMessage(
  message: string | undefined,
  fallback: string,
): string {
  const trimmed = message?.trim();
  if (!trimmed) {
    return fallback;
  }

  if (
    /backend service unavailable|failed to fetch|networkerror/i.test(trimmed)
  ) {
    return '인증 서버에 연결할 수 없습니다.';
  }

  if (/backend service timeout|timeout/i.test(trimmed)) {
    return '인증 서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.';
  }

  if (TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return fallback;
  }

  return trimmed;
}

export function getAuthErrorMessage(error: unknown, fallback: string): string {
  if (!isRecord(error)) {
    return fallback;
  }

  const apolloError = error as ApolloErrorLike;
  const message =
    firstMessage(apolloError.errors) ??
    firstMessage(apolloError.graphQLErrors) ??
    firstMessage(apolloError.networkError?.result?.errors) ??
    apolloError.message ??
    apolloError.networkError?.message;

  return sanitizeMessage(message, fallback);
}
