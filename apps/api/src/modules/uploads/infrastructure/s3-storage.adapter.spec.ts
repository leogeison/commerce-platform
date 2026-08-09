import type { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { S3StorageAdapter } from './s3-storage.adapter';

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
