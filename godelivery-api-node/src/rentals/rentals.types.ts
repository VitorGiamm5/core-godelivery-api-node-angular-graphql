import { Field, InputType, Int, ObjectType, Float } from '@nestjs/graphql';

@ObjectType()
export class RentalPlanDto {
  @Field() id: string;
  @Field() name: string;
  @Field(() => Int) days: number;
  @Field(() => Float) dailyCost: number;
}

@ObjectType()
export class RentalDto {
  @Field() id: string;
  @Field() deliverierId: string;
  @Field({ nullable: true }) motorcycleId?: string;
  @Field() planId: string;
  @Field() startDate: Date;
  @Field() endDate: Date;
  @Field() estimatedReturnDate: Date;
  @Field({ nullable: true }) returnedToBaseDate?: Date;
}

@InputType()
export class CreateRentalInput {
  @Field() deliverierId: string;
  @Field() motorcycleId: string;
  @Field() planId: string;
  @Field({ nullable: true }) startDate?: Date;
}

@ObjectType()
export class RentalReturnDto {
  @Field() message: string;
  @Field(() => Float) value: number;
  @Field(() => Int) chargeableDays: number;
  @Field(() => Float) rentalAmount: number;
  @Field(() => Float) totalCharge: number;
}
