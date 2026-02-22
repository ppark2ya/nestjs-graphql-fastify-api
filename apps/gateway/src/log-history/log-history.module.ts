import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { LogHistoryService } from './log-history.service';
import { LogHistoryResolver } from './log-history.resolver';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 3,
    }),
  ],
  providers: [LogHistoryService, LogHistoryResolver],
})
export class LogHistoryModule {}
