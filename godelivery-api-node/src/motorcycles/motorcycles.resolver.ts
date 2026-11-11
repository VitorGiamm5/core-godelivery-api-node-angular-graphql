import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard.js';
import { MotorcycleDto, MotorcycleModelDto, CreateMotorcycleInput } from './motorcycles.types.js';
import { MotorcyclesService } from './motorcycles.service.js';

@Resolver()
@UseGuards(AuthGuard)
export class MotorcyclesResolver {
  constructor(private readonly service: MotorcyclesService) {}

  @Query(() => [MotorcycleModelDto]) motorcycleModels(@Args('id', { nullable: true }) id?: string, @Args('name', { nullable: true }) name?: string) { return this.service.models(id, name); }
  @Query(() => [MotorcycleDto]) motorcycles(@Args('plate', { nullable: true }) plate?: string, @Args('page', { type: () => Int, defaultValue: 1 }) page = 1, @Args('limit', { type: () => Int, defaultValue: 100 }) limit = 100) { return this.service.list(plate, page, limit); }
  @Query(() => Int) motorcycleCount(@Args('plate', { nullable: true }) plate?: string) { return this.service.count(plate); }
  @Query(() => MotorcycleDto) motorcycle(@Args('id') id: string) { return this.service.get(id); }
  @Mutation(() => MotorcycleDto) createMotorcycle(@Args('input') input: CreateMotorcycleInput) { return this.service.create(input); }
  @Mutation(() => MotorcycleDto) changeMotorcyclePlate(@Args('id') id: string, @Args('plate') plate: string) { return this.service.changePlate(id, plate); }
  @Mutation(() => Boolean) deleteMotorcycle(@Args('id') id: string) { return this.service.remove(id); }
}
