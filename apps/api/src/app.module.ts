import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { AppConfigModule } from './shared/config/config.module';

@Module({
  imports: [AppConfigModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
