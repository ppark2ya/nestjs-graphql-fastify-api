import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthProxyService } from './auth-proxy.service';
import { AuthProxyResolver } from './auth-proxy.resolver';
import { CircuitBreakerModule } from '../circuit-breaker/circuit-breaker.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 3,
    }),
    CircuitBreakerModule,
  ],
  providers: [AuthProxyService, AuthProxyResolver],
  exports: [AuthProxyService],
})
export class AuthProxyModule {}
