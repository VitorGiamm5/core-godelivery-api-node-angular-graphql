import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { MotorcyclesService } from './motorcycles.service.js';
import { MotorcyclesResolver } from './motorcycles.resolver.js';

@Module({ imports: [NotificationsModule], providers: [MotorcyclesService, MotorcyclesResolver], exports: [MotorcyclesService] })
export class MotorcyclesModule {}
