import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { EnvVars } from '../../../shared/config/env.schema';
import type { StoragePort, UploadStorageInput } from '../domain/storage.port';

/**
 * Implementação concreta da `StoragePort` (UPL-008) via API S3 — funciona
 * com qualquer provedor compatível (AWS S3, Cloudflare R2, DigitalOcean
 * Spaces, MinIO, etc.), já que `S3Client`/`PutObjectCommand` só falam o
 * protocolo, sem presumir qual provedor está por trás (quem decide isso é
 * quem constrói o `S3Client` recebido aqui, fora desta classe).
 *
 * `s3Client`, `bucket` e `publicUrlBase` chegam via construtor, já
 * resolvidos — a classe fica agnóstica de `ConfigService`/Nest e trivial de
 * testar com um `S3Client` fake (só precisa expor `.send`), sem rede real.
 *
 * Credenciais: propositalmente não exigidas aqui. O `S3Client` recebido
 * pode ou não ter `credentials` explícitas — sem elas, o SDK usa a cadeia
 * padrão de credenciais da AWS (variáveis de ambiente `AWS_*`, IAM role,
 * etc.), útil para S3 real em produção com IAM. Provedores S3-compatible
 * que exigem `accessKeyId`/`secretAccessKey` explícitos (R2, MinIO, Spaces)
 * fornecem `STORAGE_S3_ACCESS_KEY_ID`/`STORAGE_S3_SECRET_ACCESS_KEY`
 * (UPL-009, ver `buildS3Client` abaixo).
 */
export class S3StorageAdapter implements StoragePort {
  private readonly publicUrlBase: string;

  constructor(
    private readonly s3Client: S3Client,
    private readonly bucket: string,
    publicUrlBase: string,
  ) {
    // Remove a barra final, se houver, para nunca produzir "//" ao
    // concatenar com o fileName em `upload()` — `publicUrlBase` pode
    // chegar da configuração com ou sem "/" no final.
    this.publicUrlBase = publicUrlBase.replace(/\/+$/, '');
  }

  async upload(input: UploadStorageInput): Promise<{ url: string }> {
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.fileName,
        Body: input.content,
        ContentType: input.mimeType,
      }),
    );

    return { url: `${this.publicUrlBase}/${input.fileName}` };
  }
}

type S3ClientEnvVars = Pick<
  EnvVars,
  | 'STORAGE_S3_REGION'
  | 'STORAGE_S3_ENDPOINT'
  | 'STORAGE_S3_FORCE_PATH_STYLE'
  | 'STORAGE_S3_ACCESS_KEY_ID'
  | 'STORAGE_S3_SECRET_ACCESS_KEY'
>;

/**
 * Monta o `S3Client` a partir das variáveis de ambiente já validadas por
 * `envSchema` (UPL-009) — `STORAGE_S3_FORCE_PATH_STYLE` chega aqui já como
 * `boolean` (o schema resolve a conversão string→boolean, não esta função).
 *
 * `credentials` fica `undefined` quando `STORAGE_S3_ACCESS_KEY_ID`/
 * `STORAGE_S3_SECRET_ACCESS_KEY` não são fornecidas (regra "ambas ou
 * nenhuma" já garantida pelo `envSchema`) — o `S3Client` então usa a cadeia
 * padrão de credenciais do AWS SDK.
 */
export function buildS3Client(env: S3ClientEnvVars): S3Client {
  const hasExplicitCredentials =
    env.STORAGE_S3_ACCESS_KEY_ID !== undefined &&
    env.STORAGE_S3_SECRET_ACCESS_KEY !== undefined;

  return new S3Client({
    region: env.STORAGE_S3_REGION,
    endpoint: env.STORAGE_S3_ENDPOINT,
    forcePathStyle: env.STORAGE_S3_FORCE_PATH_STYLE,
    credentials: hasExplicitCredentials
      ? {
          accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID!,
          secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY!,
        }
      : undefined,
  });
}
