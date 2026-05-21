import { Field, Float, ObjectType } from '@nestjs/graphql';
import { KioskAdminTerminalInfo } from './kiosk-admin-terminal-info.model';

@ObjectType({ description: '통화별 외화환전 가능 단말기 목록' })
export class KioskAdminReleaseCurrencyTerminals {
  @Field(() => Float)
  exchangeRate: number;

  @Field(() => [KioskAdminTerminalInfo])
  terminalInfos: KioskAdminTerminalInfo[];
}
