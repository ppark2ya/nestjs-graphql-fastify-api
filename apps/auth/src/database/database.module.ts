import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, MySql2Database } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');

export type DrizzleDB = MySql2Database<typeof schema>;

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: async (config: ConfigService): Promise<DrizzleDB> => {
        const connection = await mysql.createConnection({
          host: config.get<string>('DB_HOST', 'localhost'),
          port: config.get<number>('DB_PORT', 3306),
          user: config.get<string>('DB_USERNAME', 'root'),
          password: config.get<string>('DB_PASSWORD', ''),
          database: config.get<string>('DB_DATABASE', 'auth'),
        });
        return drizzle(connection, { schema, mode: 'default' });
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
