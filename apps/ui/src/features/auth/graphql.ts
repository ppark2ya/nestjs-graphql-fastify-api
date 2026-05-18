import { gql } from '@apollo/client';

export const LOGIN_MUTATION = gql`
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      requiresTwoFactor
      tokens {
        accessToken
        refreshToken
        expiresIn
      }
      twoFactorToken
    }
  }
`;

export const VERIFY_TWO_FACTOR_MUTATION = gql`
  mutation VerifyTwoFactor($input: TotpVerifyInput!) {
    verifyTwoFactor(input: $input) {
      accessToken
      refreshToken
      expiresIn
    }
  }
`;

export const REFRESH_TOKEN_MUTATION = gql`
  mutation RefreshToken($input: RefreshTokenInput!) {
    refreshToken(input: $input) {
      accessToken
      refreshToken
      expiresIn
    }
  }
`;

export const CHANGE_PASSWORD_MUTATION = gql`
  mutation ChangePassword($input: ChangePasswordInput!) {
    changePassword(input: $input) {
      success
      message
    }
  }
`;

export interface AuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResponse {
  login: {
    requiresTwoFactor: boolean;
    tokens: AuthTokenResponse | null;
    twoFactorToken: string | null;
  };
}

export interface LoginVariables {
  input: {
    loginId: string;
    password: string;
  };
}

export interface VerifyTwoFactorVariables {
  input: {
    totpCode: string;
  };
}

export interface VerifyTwoFactorResponse {
  verifyTwoFactor: AuthTokenResponse;
}

export interface RefreshTokenResponse {
  refreshToken: AuthTokenResponse;
}

export interface ChangePasswordResponse {
  changePassword: {
    success: boolean;
    message: string;
  };
}
