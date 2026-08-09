import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { StoragePort, UploadStorageInput } from '../domain/storage.port';

/**
 * Implementação concreta da `StoragePort` (UPL-008) via API S3 — funciona
 * com qualquer provedor compatível (AWS S3, Cloudflare R2, DigitalOcean
 * Spaces, MinIO, etc.), já que `S3Client`/`PutObjectCommand` só falam o
 * protocolo, sem presumir qual provedor está por trás (quem decide isso é
 * quem constrói o `S3Client` recebido aqui, fora desta classe).
 *
 * Escopo reduzido desta tarefa (correção da revisão): esta classe **não**
 * é registrada em nenhum módulo Nest, não lê `ConfigService`/env
 * diretamente e não tem uma função `buildS3Client()` associada — todo esse
 * wiring (env vars, `STORAGE_PORT`, `UploadsModule`) só entra na UPL-009,
 * quando existir de fato um consumidor runtime da porta. Registrar
 * configuração de storage obrigatória antes disso faria a API inteira
 * exigir credenciais de um provedor externo antes de existir qualquer rota
 * funcional que as use.
 *
 * `s3Client`, `bucket` e `publicUrlBase` chegam via construtor, já
 * resolvidos — a classe fica agnóstica de `ConfigService`/Nest e trivial de
 * testar com um `S3Client` fake (só precisa expor `.send`), sem rede real.
 *
 * Credenciais: propositalmente não exigidas aqui. O `S3Client` recebido
 * pode ou não ter `credentials` explícitas — sem elas, o SDK usa a cadeia
 * padrão de credenciais da AWS (variáveis de ambiente `AWS_*`, IAM role,
 * etc.), útil para S3 real em produção com IAM. Como compatibilizar isso
 * com provedores S3-compatible que exigem `accessKeyId`/`secretAccessKey`
 * explícitos é decisão da UPL-009, não desta classe.
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
