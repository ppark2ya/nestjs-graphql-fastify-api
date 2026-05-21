import { registerEnumType } from '@nestjs/graphql';

export enum CurrencyCode {
  CNY = 'CNY',
  JPY = 'JPY',
  USD = 'USD',
  TWD = 'TWD',
  VND = 'VND',
  EUR = 'EUR',
  HKD = 'HKD',
  PHP = 'PHP',
  SGD = 'SGD',
  THB = 'THB',
  CAD = 'CAD',
  GBP = 'GBP',
  MYR = 'MYR',
  IDR = 'IDR',
  AUD = 'AUD',
  KRW = 'KRW',
}

registerEnumType(CurrencyCode, { name: 'CurrencyCode' });
