import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { AppConfigModule } from './shared/config/config.module';
import { HttpModule } from './shared/http/http.module';

@Module({
  imports: [AppConfigModule, HttpModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
