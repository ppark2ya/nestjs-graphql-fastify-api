export const AUTH_ERROR = {
  ACCOUNT_PENDING: {
    code: '11001',
    status: 400,
    message: '승인이 필요한 계정입니다. 관리자에게 문의하세요.',
  },
  ACCOUNT_INACTIVE: {
    code: '11002',
    status: 400,
    message: '일시적으로 사용할 수 없는 계정입니다. 관리자에게 문의하세요.',
  },
  ACCOUNT_DELETED: {
    code: '11003',
    status: 401,
    message: '아이디와 패스워드를 확인해주세요.',
  },
  PASSWORD_EXPIRED: {
    code: '11004',
    status: 400,
    message:
      '마지막 패스워드 변경 후 90일이 지났습니다. 패스워드를 변경해주세요.',
  },
  ACCOUNT_LOCKED: {
    code: '11005',
    status: 403,
    message:
      '5회 이상 로그인이 실패하여 계정이 잠겼습니다. 관리자에게 문의하세요.',
  },
  INVALID_CREDENTIALS: {
    code: '11010',
    status: 401,
    message: '아이디와 패스워드를 확인해주세요.',
  },
  INVALID_OTP: {
    code: '11011',
    status: 401,
    message: 'OTP 코드가 올바르지 않습니다.',
  },
  TOKEN_EXPIRED: {
    code: '11012',
    status: 401,
    message: '인증 토큰이 만료되었습니다.',
  },
} as const;

export type AuthErrorKey = keyof typeof AUTH_ERROR;
