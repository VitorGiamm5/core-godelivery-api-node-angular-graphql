import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ForbiddenException, UseGuards } from '@nestjs/common';
import argon2 from 'argon2';
import { AuthGuard } from '../common/auth.guard.js';
import { PrismaService } from '../database/prisma.service.js';
import { requireEntity } from '../common/errors.js';
import { UserDto } from './identity.types.js';

@Resolver()
@UseGuards(AuthGuard)
export class IdentityResolver {
  constructor(private readonly db: PrismaService) {}

  @Query(() => UserDto)
  async me(@Context() context: { req: { user: { sub: string } } }) {
    return requireEntity(await this.db.user.findUnique({ where: { id: context.req.user.sub }, select: { id: true, email: true, name: true, role: true } }), 'Usuário');
  }

  @Mutation(() => UserDto)
  async createUser(@Context() context: { req: { user: { sub: string } } }, @Args('email') email: string, @Args('name') name: string, @Args('password') password: string) {
    const actor = await this.db.user.findUnique({ where: { id: context.req.user.sub } });
    if (actor?.role !== 'admin') throw new ForbiddenException('Acesso reservado ao administrador');
    if (password.length < 12) throw new ForbiddenException('A senha deve ter ao menos 12 caracteres');
    return this.db.user.create({ data: { email: email.trim().toLowerCase(), name: name.trim(), passwordHash: await argon2.hash(password) }, select: { id: true, email: true, name: true, role: true } });
  }
}
