import { Module } from '@nestjs/common';
import { RentalsService } from './rentals.service.js';
import { RentalsResolver } from './rentals.resolver.js';

@Module({ providers: [RentalsService, RentalsResolver] })
export class RentalsModule {}
