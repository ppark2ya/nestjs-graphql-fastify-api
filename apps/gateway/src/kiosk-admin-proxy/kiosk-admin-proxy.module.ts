import { Module } from '@nestjs/common';
import { KioskAdminProxyResolver } from './kiosk-admin-proxy.resolver';
import { KioskAdminProxyService } from './kiosk-admin-proxy.service';

@Module({
  providers: [KioskAdminProxyService, KioskAdminProxyResolver],
  exports: [KioskAdminProxyService],
})
export class KioskAdminProxyModule {}
