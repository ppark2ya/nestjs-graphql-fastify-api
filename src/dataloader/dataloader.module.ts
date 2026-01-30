import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DataLoaderService } from './dataloader.service';
import { AppService } from '../app.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 3,
    }),
  ],
  providers: [DataLoaderService, AppService],
  exports: [DataLoaderService],
})
export class DataLoaderModule {}
