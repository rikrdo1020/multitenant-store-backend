import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import configuration, { validateEnv } from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { LoggerModule } from './lib/logger/logger.module';
import { CloudinaryModule } from './lib/cloudinary/cloudinary.module';
import { ResendModule } from './lib/resend/resend.module';

import { TenantMiddleware } from './common/middleware/tenant.middleware';

import { AuthModule } from './modules/auth/auth.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { ProductModule } from './modules/product/product.module';
import { CategoryModule } from './modules/category/category.module';
import { BrandModule } from './modules/brand/brand.module';
import { TagModule } from './modules/tag/tag.module';
import { ProductTypeModule } from './modules/product-type/product-type.module';
import { OrderModule } from './modules/order/order.module';
import { CustomerModule } from './modules/customer/customer.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { ComboModule } from './modules/combo/combo.module';
import { SettingsModule } from './modules/settings/settings.module';
import { MemberModule } from './modules/member/member.module';
import { SuperadminModule } from './modules/superadmin/superadmin.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { UploadModule } from './modules/upload/upload.module';
import { WebhookModule } from './modules/webhook/webhook.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    PrismaModule,
    LoggerModule,
    CloudinaryModule,
    ResendModule,

    AuthModule,
    TenantModule,
    ProductModule,
    CategoryModule,
    BrandModule,
    TagModule,
    ProductTypeModule,
    OrderModule,
    CustomerModule,
    ShippingModule,
    ComboModule,
    SettingsModule,
    MemberModule,
    SuperadminModule,
    MarketplaceModule,
    UploadModule,
    WebhookModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // TenantMiddleware runs on ALL routes. Routes that don't send x-tenant-id
    // (auth, superadmin) will simply have req.tenant = undefined.
    consumer
      .apply(TenantMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
