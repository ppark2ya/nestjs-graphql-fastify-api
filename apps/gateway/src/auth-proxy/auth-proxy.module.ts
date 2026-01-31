import { Module } from '@nestjs/common';
import { AuthProxyService } from './auth-proxy.service';
import { AuthProxyResolver } from './auth-proxy.resolver';

@Module({
  providers: [AuthProxyService, AuthProxyResolver],
})
export class AuthProxyModule {}
