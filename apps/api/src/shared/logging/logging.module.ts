import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

export const REQUEST_ID_HEADER = 'x-request-id';

function resolveRequestId(req: IncomingMessage): string | undefined {
  const header = req.headers[REQUEST_ID_HEADER];
  return Array.isArray(header) ? header[0] : header;
}

/**
 * Logging estruturado da API (INF-002): substitui o logger padrão do Nest
 * pelo `pino` via `nestjs-pino`, em formato JSON, com um request ID
 * correlacionando todas as linhas de log de uma mesma requisição.
 *
 * `genReqId` cobre as três exigências do request ID num só lugar: reaproveita
 * `x-request-id` se o cliente já mandou um, gera um novo (`crypto.randomUUID`)
 * quando não veio nenhum, e devolve esse mesmo valor no header da resposta —
 * assim quem chamou a API sempre sabe qual ID corresponde à sua requisição,
 * mesmo em caso de erro tratado pelo `AllExceptionsFilter` (INF-001, que
 * continua funcionando sem nenhuma mudança: o `Logger` do `@nestjs/common`
 * usado lá passa a rotear para o Pino automaticamente depois que
 * `app.useLogger()` é configurado em `main.ts`).
 *
 * Sem `pino-pretty`: essa lib é só para leitura humana em dev e nunca deve
 * rodar em produção (custo de performance, formato não é o que ferramentas
 * de log esperam) — mais simples não usar em lugar nenhum do que arriscar
 * vazar para produção por engano.
 *
 * Fora do escopo (não antecipado aqui): tracing distribuído, OpenTelemetry,
 * ou qualquer integração com agregador externo de log.
 */
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (req: IncomingMessage, res: ServerResponse) => {
          const id = resolveRequestId(req) ?? randomUUID();
          res.setHeader(REQUEST_ID_HEADER, id);
          return id;
        },
      },
    }),
  ],
})
export class LoggingModule {}
