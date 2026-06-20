import { NestFactory, Reflector } from '@nestjs/core';
import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Disable NestJS built-in logger in production; Winston handles it
    logger: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['log', 'error', 'warn', 'debug'],
  });

  const config = app.get(ConfigService);
  const reflector = app.get(Reflector);

  // ---------------------------------------------------------------------------
  // Security
  // ---------------------------------------------------------------------------
  app.use(helmet());

  const rawOrigin = (config.get<string>('FRONTEND_URL') ?? '').replace(/^["']|["']$/g, '');
  const allowedOrigins = rawOrigin.split(',').map((o) => o.trim().replace(/^["']|["']$/g, '')).filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id'],
  });

  // ---------------------------------------------------------------------------
  // Global prefix
  // ---------------------------------------------------------------------------
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'api/payments/yappy/webhook', method: RequestMethod.GET }],
  });

  // ---------------------------------------------------------------------------
  // Global pipes — validate and whitelist all incoming DTOs
  // ---------------------------------------------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // ---------------------------------------------------------------------------
  // Global guards — JWT + Roles enforced on all routes unless @Public()
  // ---------------------------------------------------------------------------
  app.useGlobalGuards(new JwtAuthGuard(reflector), new RolesGuard(reflector));

  // ---------------------------------------------------------------------------
  // Global filters & interceptors
  // ---------------------------------------------------------------------------
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------
  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port, '0.0.0.0');

  logger.log(`Application running on http://0.0.0.0:${port}/api/v1`);
}

bootstrap();
