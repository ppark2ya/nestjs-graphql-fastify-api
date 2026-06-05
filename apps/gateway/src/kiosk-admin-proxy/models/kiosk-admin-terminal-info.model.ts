import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: '키오스크 단말기 정보' })
export class KioskAdminTerminalInfo {
  @Field(() => String)
  terminalNo: string;

  @Field(() => String)
  terminalNm: string;

  @Field(() => String)
  addr: string;

  @Field(() => String)
  detailAddr: string;

  @Field(() => String)
  lat: string;

  @Field(() => String)
  lon: string;

  @Field(() => String)
  operationDay: string;
}
