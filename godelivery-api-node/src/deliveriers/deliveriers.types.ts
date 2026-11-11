import { Field, InputType, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class DeliverierDto {
  @Field() id: string;
  @Field() fullName: string;
  @Field() cnpj: string;
  @Field() birthDate: Date;
  @Field() licenseNumber: string;
  @Field() licenseType: string;
  @Field({ nullable: true }) hasLicenseFile?: boolean;
}

@InputType()
export class CreateDeliverierInput {
  @Field() fullName: string;
  @Field() cnpj: string;
  @Field() birthDate: Date;
  @Field() licenseNumber: string;
  @Field() licenseType: string;
  @Field() issueDate: Date;
  @Field() expiryDate: Date;
}
