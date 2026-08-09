import { S3Client, type PutObjectCommand } from '@aws-sdk/client-s3';
import { buildS3Client, S3StorageAdapter } from './s3-storage.adapter';

const BUCKET = 'my-bucket';
const FILE_NAME = 'a1b2c3.jpg';
const CONTENT = Buffer.from('fake-image-content');
const MIME_TYPE = 'image/jpeg';

function buildFakeS3Client() {
  const send = jest.fn().mockResolvedValue({});

  return { send: send as unknown as S3Client['send'] } as unknown as S3Client;
}

describe('S3StorageAdapter', () => {
  it('envia um PutObjectCommand com Bucket, Key, Body e ContentType corretos', async () => {
    const s3Client = buildFakeS3Client();
    const adapter = new S3StorageAdapter(s3Client, BUCKET, 'https://cdn.example.com');

    await adapter.upload({ fileName: FILE_NAME, content: CONTENT, mimeType: MIME_TYPE });

    expect(s3Client.send).toHaveBeenCalledTimes(1);

    const command = (s3Client.send as jest.Mock).mock.calls[0][0] as PutObjectCommand;

    expect(command.input).toEqual({
      Bucket: BUCKET,
      Key: FILE_NAME,
      Body: CONTENT,
      ContentType: MIME_TYPE,
    });
  });

  it('retorna a URL pública combinando publicUrlBase (sem "/" final) e fileName', async () => {
    const s3Client = buildFakeS3Client();
    const adapter = new S3StorageAdapter(s3Client, BUCKET, 'https://cdn.example.com');

    const result = await adapter.upload({
      fileName: FILE_NAME,
      content: CONTENT,
      mimeType: MIME_TYPE,
    });

    expect(result).toEqual({ url: 'https://cdn.example.com/a1b2c3.jpg' });
  });

  it('publicUrlBase com "/" final produz a mesma URL, sem barra dupla', async () => {
    const s3Client = buildFakeS3Client();
    const adapter = new S3StorageAdapter(s3Client, BUCKET, 'https://cdn.example.com/');

    const result = await adapter.upload({
      fileName: FILE_NAME,
      content: CONTENT,
      mimeType: MIME_TYPE,
    });

    expect(result).toEqual({ url: 'https://cdn.example.com/a1b2c3.jpg' });
  });
});

/**
 * Testes rasos de propósito: a config interna resolvida do `S3Client` (ex.:
 * `region`) é normalizada pelo AWS SDK v3 em provedores assíncronos, não em
 * valores simples inspecionáveis diretamente — tentar afirmar sobre isso
 * tornaria o teste frágil sem cobrir nada que o `S3StorageAdapter` (com
 * client fake, acima) já não cubra via comportamento real de upload. Aqui
 * só confirmamos que `buildS3Client` não lança e devolve uma instância de
 * `S3Client` nas combinações de configuração possíveis.
 */
describe('buildS3Client', () => {
  const BASE_ENV = {
    STORAGE_S3_REGION: 'auto',
    STORAGE_S3_ENDPOINT: undefined,
    STORAGE_S3_FORCE_PATH_STYLE: false,
    STORAGE_S3_ACCESS_KEY_ID: undefined,
    STORAGE_S3_SECRET_ACCESS_KEY: undefined,
  };

  it('sem endpoint e sem credenciais: não lança, devolve um S3Client', () => {
    expect(buildS3Client(BASE_ENV)).toBeInstanceOf(S3Client);
  });

  it('com endpoint (provedor S3-compatible) e forcePathStyle=true: não lança', () => {
    const client = buildS3Client({
      ...BASE_ENV,
      STORAGE_S3_ENDPOINT: 'http://localhost:9000',
      STORAGE_S3_FORCE_PATH_STYLE: true,
    });

    expect(client).toBeInstanceOf(S3Client);
  });

  it('com credenciais explícitas: não lança', () => {
    const client = buildS3Client({
      ...BASE_ENV,
      STORAGE_S3_ACCESS_KEY_ID: 'access-key',
      STORAGE_S3_SECRET_ACCESS_KEY: 'secret-key',
    });

    expect(client).toBeInstanceOf(S3Client);
  });
});
