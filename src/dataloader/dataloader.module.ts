import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DataLoaderService } from './dataloader.service';
import { AppService } from '../app.service';

@Module({
  imports: [HttpModule],
  providers: [DataLoaderService, AppService],
  exports: [DataLoaderService],
})
export class DataLoaderModule {}
