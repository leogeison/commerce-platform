import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { AppConfigModule } from './shared/config/config.module';
import { HttpModule } from './shared/http/http.module';
import { LoggingModule } from './shared/logging/logging.module';

@Module({
  imports: [AppConfigModule, LoggingModule, HttpModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
