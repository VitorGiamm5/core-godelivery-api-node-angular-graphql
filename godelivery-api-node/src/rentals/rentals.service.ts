import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { requireBusiness, requireEntity } from '../common/errors.js';
import { calculateReturn } from './rental-charge.js';
import type { CreateRentalInput } from './rentals.types.js';

@Injectable()
export class RentalsService {
  constructor(private readonly db: PrismaService) {}

  async plans() {
    const rows = await this.db.rentalPlan.findMany({ orderBy: { days: 'asc' } });
    return rows.map(row => ({ ...row, dailyCost: Number(row.dailyCost) }));
  }

  async list() { return this.db.rental.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }); }
  async get(id: string) { return requireEntity(await this.db.rental.findUnique({ where: { id } }), 'Locação'); }

  async create(input: CreateRentalInput) {
    const plan = requireEntity(await this.db.rentalPlan.findUnique({ where: { id: input.planId } }), 'Plano');
    requireBusiness(plan.days > 0, 'Duração do plano inválida');
    requireEntity(await this.db.motorcycle.findUnique({ where: { id: input.motorcycleId } }), 'Motocicleta');
    requireBusiness((await this.db.rental.count({ where: { motorcycleId: input.motorcycleId, returnedToBaseDate: null } })) === 0, 'Motocicleta possui locação ativa');
    requireEntity(await this.db.deliverier.findUnique({ where: { id: input.deliverierId } }), 'Entregador');
    const startDate = input.startDate ? new Date(input.startDate) : new Date();
    requireBusiness(!Number.isNaN(startDate.getTime()), 'Data de início inválida');
    const endDate = new Date(startDate.getTime() + plan.days * 86_400_000);
    requireBusiness(!Number.isNaN(endDate.getTime()), 'Data de término inválida');
    return this.db.rental.create({ data: {
      planId: plan.id, motorcycleId: input.motorcycleId, deliverierId: input.deliverierId,
      startDate, endDate, estimatedReturnDate: endDate,
    } });
  }

  async returnToBase(id: string, date: Date) {
    const rental = requireEntity(await this.db.rental.findUnique({ where: { id }, include: { plan: true } }), 'Locação');
    requireBusiness(!rental.returnedToBaseDate, 'Locação já devolvida');
    const returned = new Date(date);
    requireBusiness(!Number.isNaN(returned.getTime()) && returned > rental.startDate, 'Devolução deve ocorrer após o início');
    const charge = calculateReturn(returned, rental.estimatedReturnDate, rental.plan.days, Number(rental.plan.dailyCost));
    await this.db.rental.update({ where: { id }, data: { returnedToBaseDate: returned } });
    return charge;
  }
}
