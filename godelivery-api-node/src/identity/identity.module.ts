import { Module } from '@nestjs/common';
import { IdentityResolver } from './identity.resolver.js';

@Module({ providers: [IdentityResolver] })
export class IdentityModule {}
