import { registerEnumType } from '@nestjs/graphql';

export enum CurrencyCode {
  CNY = 'CNY',
  USD = 'USD',
  JPY = 'JPY',
}

registerEnumType(CurrencyCode, { name: 'CurrencyCode' });
