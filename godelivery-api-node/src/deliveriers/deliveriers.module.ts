import { Module } from '@nestjs/common';
import { DeliveriersService } from './deliveriers.service.js';
import { DeliveriersResolver } from './deliveriers.resolver.js';
import { LicenseController } from './license.controller.js';

@Module({ providers: [DeliveriersService, DeliveriersResolver], controllers: [LicenseController], exports: [DeliveriersService] })
export class DeliveriersModule {}
