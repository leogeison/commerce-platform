import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpModule } from '../../shared/http/http.module';
import type { EnvVars } from '../../shared/config/env.schema';
import { IdentityModule } from '../identity/identity.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { UploadImageUseCase } from './application/upload-image.use-case';
import { STORAGE_PORT } from './domain/storage.port';
import { buildS3Client, S3StorageAdapter } from './infrastructure/s3-storage.adapter';
import { UploadImageController } from './presentation/upload-image.controller';

/**
 * Primeiro módulo do domínio `uploads` ligado à árvore de módulos (UPL-009)
 * — até aqui `UploadImageController` existia só como classe solta, nunca
 * registrada (mesmo padrão que `AffiliateRedirectController` teve entre
 * TRK-002 e TRK-005).
 *
 * Imports explícitos, sem depender de nada que só por acaso já esteja
 * carregado via `AppModule`:
 * - `HttpModule`: exporta `OriginGuard`, usado pelo controller.
 * - `IdentityModule`: exporta `SessionAuthGuard`.
 * - `TenancyModule`: exporta `SiteAuthorizationGuard` (`@MinRole` é só
 *   `SetMetadata`, lido pelo próprio guard via `Reflector` — não precisa de
 *   módulo próprio).
 *
 * **Sem `DatabaseModule`**: diferente de `CatalogModule`/`IdentityModule`/
 * `TenancyModule`, nenhum provider deste módulo injeta `PrismaService`
 * diretamente (não há repository em `uploads`) — os guards importados já
 * chegam com suas próprias dependências resolvidas dentro dos módulos que
 * os exportam.
 *
 * `STORAGE_PORT` ligado a `S3StorageAdapter` via `useFactory`: o `S3Client`
 * é construído aqui (`buildS3Client`, UPL-009) a partir do `ConfigService`
 * já validado por `envSchema` — nenhuma outra parte do código lê
 * `STORAGE_S3_*` diretamente.
 */
@Module({
  imports: [HttpModule, IdentityModule, TenancyModule],
  controllers: [UploadImageController],
  providers: [
    UploadImageUseCase,
    {
      provide: STORAGE_PORT,
      useFactory: (configService: ConfigService<EnvVars, true>) => {
        const s3Client = buildS3Client({
          STORAGE_S3_REGION: configService.get('STORAGE_S3_REGION', { infer: true }),
          STORAGE_S3_ENDPOINT: configService.get('STORAGE_S3_ENDPOINT', { infer: true }),
          STORAGE_S3_FORCE_PATH_STYLE: configService.get('STORAGE_S3_FORCE_PATH_STYLE', {
            infer: true,
          }),
          STORAGE_S3_ACCESS_KEY_ID: configService.get('STORAGE_S3_ACCESS_KEY_ID', {
            infer: true,
          }),
          STORAGE_S3_SECRET_ACCESS_KEY: configService.get('STORAGE_S3_SECRET_ACCESS_KEY', {
            infer: true,
          }),
        });
        const bucket = configService.get('STORAGE_S3_BUCKET', { infer: true });
        const publicUrlBase = configService.get('STORAGE_S3_PUBLIC_URL_BASE', {
          infer: true,
        });

        return new S3StorageAdapter(s3Client, bucket, publicUrlBase);
      },
      inject: [ConfigService],
    },
  ],
})
export class UploadsModule {}
