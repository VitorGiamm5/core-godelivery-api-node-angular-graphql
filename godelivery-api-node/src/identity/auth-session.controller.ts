import { BadRequestException, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../common/auth.guard.js';
import { PrismaService } from '../database/prisma.service.js';

type AuthenticatedRequest = Request & {
  user: { jti?: string; exp?: number; sub?: string };
  log?: { info: (fields: object, message: string) => void };
};

@Controller('api/auth')
@UseGuards(AuthGuard)
export class AuthSessionController {
  constructor(private readonly db: PrismaService) {}

  @Post('logout')
  async logout(@Req() request: AuthenticatedRequest) {
    const { jti, exp, sub } = request.user;
    if (!jti || !exp) throw new BadRequestException('Access token missing revocation claims');
    await this.db.revokedAccessToken.upsert({
      where: { jti },
      create: { jti, expiresAt: new Date(exp * 1000) },
      update: { expiresAt: new Date(exp * 1000) },
    });
    await this.db.revokedAccessToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    request.log?.info({ event: 'auth.logout.succeeded', subject: sub }, 'User session revoked');
    return { message: 'Session revoked' };
  }
}
