import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class MotorcycleModelDto {
  @Field() id: string;
  @Field() name: string;
}

@ObjectType()
export class MotorcycleDto {
  @Field() id: string;
  @Field() plate: string;
  @Field(() => Int) yearManufacture: number;
  @Field() modelName: string;
}

@InputType()
export class CreateMotorcycleInput {
  @Field() plate: string;
  @Field(() => Int) yearManufacture: number;
  @Field() modelName: string;
}
