import { ObjectType, Field, Int, Float } from '@nestjs/graphql';
import { CurrencyCode } from '../enums/currency-code.enum';

@ObjectType()
export class CurrencyRate {
  @Field(() => CurrencyCode)
  currencyCode: CurrencyCode;

  @Field(() => Float)
  spreadRate: number;

  @Field(() => Int)
  terminalId: number;
}
