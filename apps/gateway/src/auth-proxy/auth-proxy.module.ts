import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthProxyService } from './auth-proxy.service';
import { AuthProxyResolver } from './auth-proxy.resolver';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'AUTH_SERVICE',
        transport: Transport.TCP,
        options: {
          host: process.env.AUTH_SERVICE_HOST ?? 'localhost',
          port: parseInt(process.env.AUTH_TCP_PORT ?? '4002', 10),
        },
      },
    ]),
  ],
  providers: [AuthProxyService, AuthProxyResolver],
  exports: [AuthProxyService],
})
export class AuthProxyModule {}

