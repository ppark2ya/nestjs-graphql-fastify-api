import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

@Global()
@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 3,
      adapter: 'fetch',
    }),
  ],
  exports: [HttpModule],
})
export class GlobalHttpModule {}
