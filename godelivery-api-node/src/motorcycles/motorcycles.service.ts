import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { requireBusiness, requireEntity } from '../common/errors.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { CreateMotorcycleInput } from './motorcycles.types.js';

export const normalizePlate = (plate: string) => plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
export const validPlate = (plate: string) => /^[A-Z]{3}(?:[0-9]{4}|[0-9][A-Z][0-9]{2})$/.test(normalizePlate(plate));

@Injectable()
export class MotorcyclesService {
  constructor(private readonly db: PrismaService, private readonly notifications: NotificationsService) {}

  async models(id?: string, name?: string) { return this.db.motorcycleModel.findMany({ where: { id: id || undefined, name: name ? { contains: name, mode: 'insensitive' } : undefined }, orderBy: { name: 'asc' } }); }

  async count(plate?: string) { return this.db.motorcycle.count({ where: plate ? { plateNormalized: { contains: normalizePlate(plate) } } : undefined }); }

  async list(plate?: string, page = 1, limit = 100) {
    requireBusiness(Number.isInteger(page) && page >= 1 && Number.isInteger(limit) && limit >= 1 && limit <= 100 && page <= Math.floor(2_147_483_647 / limit), 'Paginação inválida');
    const rows = await this.db.motorcycle.findMany({
      where: plate ? { plateNormalized: { contains: normalizePlate(plate) } } : undefined,
      include: { model: true }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
    });
    return rows.map(row => ({ id: row.id, plate: row.plate, yearManufacture: row.yearManufacture, modelName: row.model.name }));
  }

  async get(id: string) {
    const row = requireEntity(await this.db.motorcycle.findUnique({ where: { id }, include: { model: true } }), 'Motocicleta');
    return { id: row.id, plate: row.plate, yearManufacture: row.yearManufacture, modelName: row.model.name };
  }

  async create(input: CreateMotorcycleInput) {
    requireBusiness(Number.isInteger(input.yearManufacture) && input.yearManufacture > 1903 && input.yearManufacture <= new Date().getFullYear() + 1, 'Ano de fabricação inválido');
    requireBusiness(validPlate(input.plate), 'Placa inválida');
    const model = requireEntity(await this.db.motorcycleModel.findUnique({ where: { normalized: input.modelName.replace(/\W/g, '').toUpperCase() } }), 'Modelo');
    const row = await this.db.motorcycle.create({ data: { plate: normalizePlate(input.plate), plateNormalized: normalizePlate(input.plate), yearManufacture: input.yearManufacture, modelId: model.id } });
    if (row.yearManufacture === new Date().getFullYear()) await this.notifications.publishMotorcycle(row.id, row.yearManufacture);
    return this.get(row.id);
  }

  async changePlate(id: string, plate: string) {
    await this.get(id);
    requireBusiness(validPlate(plate), 'Placa inválida');
    await this.db.motorcycle.update({ where: { id }, data: { plate: normalizePlate(plate), plateNormalized: normalizePlate(plate) } });
    return this.get(id);
  }

  async remove(id: string) {
    await this.get(id);
    requireBusiness((await this.db.rental.count({ where: { motorcycleId: id, returnedToBaseDate: null } })) === 0, 'Motocicleta possui locação ativa');
    await this.db.$transaction([
      this.db.notification.deleteMany({ where: { motorcycleId: id } }),
      this.db.motorcycle.delete({ where: { id } }),
    ]);
    return true;
  }
}
