import { Global, Module } from '@nestjs/common';
import { EmailDeliveryRepository } from './email-delivery.repository';
import { EmailSecurityService } from './email-security.service';
import { ResendService } from './resend.service';

@Global()
@Module({
  providers: [EmailDeliveryRepository, EmailSecurityService, ResendService],
  exports: [EmailSecurityService, ResendService],
})
export class ResendModule {}
