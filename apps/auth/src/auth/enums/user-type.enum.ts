export enum UserType {
  ADMIN_BO = 'ADMIN_BO',
  CUSTOMER_BO = 'CUSTOMER_BO',
  KIOSK = 'KIOSK',
  DASHBOARD = 'DASHBOARD',
  PARTNER_BO = 'PARTNER_BO',
}

/** 2FA가 필요한 user_type 목록 */
export const TWO_FACTOR_REQUIRED_TYPES: ReadonlySet<string> = new Set([
  UserType.ADMIN_BO,
  UserType.CUSTOMER_BO,
  UserType.PARTNER_BO,
]);
