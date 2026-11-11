import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard.js';
import { DeliverierDto, CreateDeliverierInput } from './deliveriers.types.js';
import { DeliveriersService } from './deliveriers.service.js';

@Resolver()
@UseGuards(AuthGuard)
export class DeliveriersResolver {
  constructor(private readonly service: DeliveriersService) {}
  @Query(() => [DeliverierDto]) deliveriers() { return this.service.list(); }
  @Query(() => DeliverierDto) deliverier(@Args('id') id: string) { return this.service.get(id); }
  @Mutation(() => DeliverierDto) createDeliverier(@Args('input') input: CreateDeliverierInput) { return this.service.create(input); }
}
