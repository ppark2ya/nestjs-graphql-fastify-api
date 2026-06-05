import { Module } from '@nestjs/common';
import { LoginHistoryService } from './login-history.service';

@Module({
  providers: [LoginHistoryService],
  exports: [LoginHistoryService],
})
export class LoginHistoryModule {}
