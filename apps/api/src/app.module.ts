import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { IdentityModule } from './modules/identity/identity.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';
import { AppConfigModule } from './shared/config/config.module';
import { HttpModule } from './shared/http/http.module';
import { LoggingModule } from './shared/logging/logging.module';

@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    HttpModule,
    IdentityModule,
    TenancyModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
