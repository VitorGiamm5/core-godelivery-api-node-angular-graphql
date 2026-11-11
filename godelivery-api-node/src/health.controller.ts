import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './database/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly db: PrismaService) {}
  @Get('live') live() { return { status: 'ok' }; }
  @Get('ready') async ready() { await this.db.$queryRaw`SELECT 1`; return { status: 'ok' }; }
}
