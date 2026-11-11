import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { jwtVerify, createLocalJWKSet, type JSONWebKeySet, type JWTPayload } from 'jose';
import { readFileSync } from 'node:fs';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class AuthGuard implements CanActivate {
  private jwks?: ReturnType<typeof createLocalJWKSet>;

  constructor(private readonly db: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.getType<string>() === 'graphql'
      ? GqlExecutionContext.create(context).getContext().req
      : context.switchToHttp().getRequest();
    const token = /^Bearer (.+)$/i.exec(request.headers.authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException('Bearer token required');
    let payload: JWTPayload;
    try {
      if (!this.jwks) {
        const privateKeys = JSON.parse(readFileSync(process.env.OIDC_JWKS_PATH ?? '/data/oidc-jwks.json', 'utf8')) as JSONWebKeySet;
        this.jwks = createLocalJWKSet({ keys: privateKeys.keys.map(({ d, p, q, dp, dq, qi, ...publicKey }: any) => publicKey) });
      }
      const verified = await jwtVerify(token, this.jwks, {
        issuer: process.env.OIDC_ISSUER,
        audience: process.env.OIDC_AUDIENCE ?? 'godelivery-api',
      });
      payload = verified.payload;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
    const jti = payload.jti;
    const expiresAt = payload.exp;
    if (typeof jti !== 'string' || typeof expiresAt !== 'number') throw new UnauthorizedException('Invalid access token');
    request.user = payload;
    if (await this.db.revokedAccessToken.findUnique({ where: { jti } })) {
      request.log?.warn({ event: 'auth.access_token.rejected', reason: 'revoked' }, 'Revoked access token rejected');
      throw new UnauthorizedException('Revoked access token');
    }
    return true;
  }
}
