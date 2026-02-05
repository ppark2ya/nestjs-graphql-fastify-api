import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { LogStreamerProxyService } from './log-streamer-proxy.service';
import { LogStreamerProxyResolver } from './log-streamer-proxy.resolver';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 3,
    }),
  ],
  providers: [LogStreamerProxyService, LogStreamerProxyResolver],
  exports: [LogStreamerProxyService],
})
export class LogStreamerProxyModule {}
