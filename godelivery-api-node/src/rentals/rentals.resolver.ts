import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard.js';
import { RentalDto, RentalPlanDto, RentalReturnDto, CreateRentalInput } from './rentals.types.js';
import { RentalsService } from './rentals.service.js';

@Resolver()
@UseGuards(AuthGuard)
export class RentalsResolver {
  constructor(private readonly service: RentalsService) {}
  @Query(() => [RentalPlanDto]) rentalPlans() { return this.service.plans(); }
  @Query(() => [RentalDto]) rentals() { return this.service.list(); }
  @Query(() => RentalDto) rental(@Args('id') id: string) { return this.service.get(id); }
  @Mutation(() => RentalDto) createRental(@Args('input') input: CreateRentalInput) { return this.service.create(input); }
  @Mutation(() => RentalReturnDto) returnRental(@Args('id') id: string, @Args('returnedToBaseDate') returnedToBaseDate: Date) { return this.service.returnToBase(id, returnedToBaseDate); }
}
