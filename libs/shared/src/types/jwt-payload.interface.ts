export interface JwtPayload {
  sub: string; // tb_account.id
  loginId: string;
  name: string;
  userType: string; // ADMIN_BO, CUSTOMER_BO, DASHBOARD, PARTNER_BO, LOTTE_CARD_BO
  roleType?: string;
  customerNo: string;
  iat: number;
  exp: number;
  jti: string;
}
