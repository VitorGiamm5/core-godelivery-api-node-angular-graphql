import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { AppModule } from './app.module.js';
import { setupOidc } from './identity/oidc.js';
import { trustedWebOrigins } from './common/web-origins.js';

const safeRequestPath = (requestUrl?: string) => (requestUrl?.split('?', 1)[0] || '/')
  .replace(/\/[a-z\d_-]{24,}(?=\/|$)/gi, '/:id')
  .replace(/\/\d{6,}(?=\/|$)/g, '/:id');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '2mb' });
  const logger = pino({
    level: process.env.LOG_LEVEL ?? 'info',
    redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers.referer', 'res.headers["set-cookie"]', 'res.headers.location', 'password', 'licenseImageBase64'],
    transport: process.env.LOKI_URL ? { targets: [
      { target: 'pino/file', options: { destination: 1 } },
      { target: 'pino-loki', options: { host: process.env.LOKI_URL, labels: { app: 'godelivery-api-node' }, silenceErrors: true } },
    ] } : undefined,
  });
  app.set('trust proxy', 1);
  app.use(pinoHttp({
    logger,
    genReqId: req => {
      const correlationId = req.headers['x-correlation-id'];
      return typeof correlationId === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(correlationId)
        ? correlationId
        : randomUUID();
    },
    serializers: {
      req: req => ({ id: req.id, method: req.method, url: safeRequestPath(req.url) }),
      res: res => ({ statusCode: res.statusCode }),
    },
  }));
  app.enableCors({ origin: trustedWebOrigins(process.env.WEB_URL ?? ''), credentials: false });
  await setupOidc(app);
  await app.listen(Number(process.env.PORT ?? 9105), '0.0.0.0');
  logger.info({ port: process.env.PORT ?? 9105 }, 'GoDelivery Node started');
}
await bootstrap();
