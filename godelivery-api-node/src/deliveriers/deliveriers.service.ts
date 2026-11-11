import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { requireBusiness, requireEntity } from '../common/errors.js';
import type { CreateDeliverierInput } from './deliveriers.types.js';

export function validCnpj(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!/^\d{14}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  for (let length = 12; length < 14; length++) {
    let weight = length - 7;
    const sum = [...digits.slice(0, length)].reduce((total, digit) => {
      const result = total + Number(digit) * weight;
      weight = weight === 2 ? 9 : weight - 1;
      return result;
    }, 0);
    const check = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (check !== Number(digits[length])) return false;
  }
  return true;
}

@Injectable()
export class DeliveriersService {
  constructor(private readonly db: PrismaService) {}

  async list() {
    const rows = await this.db.deliverier.findMany({ include: { license: true }, orderBy: { createdAt: 'desc' }, take: 100 });
    return rows.map(row => ({ ...row, licenseNumber: row.license?.id, licenseType: row.license?.type, hasLicenseFile: !!row.license?.objectKey }));
  }

  async get(id: string) {
    const row = requireEntity(await this.db.deliverier.findUnique({ where: { id }, include: { license: true } }), 'Entregador');
    return { ...row, licenseNumber: row.license?.id, licenseType: row.license?.type, hasLicenseFile: !!row.license?.objectKey };
  }

  async create(input: CreateDeliverierInput) {
    requireBusiness(input.fullName.trim().length >= 3, 'Nome inválido');
    requireBusiness(validCnpj(input.cnpj), 'CNPJ inválido');
    requireBusiness(['A', 'AB'].includes(input.licenseType.trim().toUpperCase()), 'Categoria de CNH inválida');
    requireBusiness(/^\d{11}$/.test(input.licenseNumber), 'Número de CNH inválido');
    const now = new Date();
    const birthDate = new Date(input.birthDate);
    requireBusiness(!Number.isNaN(birthDate.getTime()), 'Data de nascimento inválida');
    const age = now.getUTCFullYear() - birthDate.getUTCFullYear() - (now.toISOString().slice(5, 10) < birthDate.toISOString().slice(5, 10) ? 1 : 0);
    requireBusiness(age >= 18, 'Entregador deve ter ao menos 18 anos');
    requireBusiness(new Date(input.issueDate) <= now && new Date(input.expiryDate) > now && new Date(input.expiryDate) > new Date(input.issueDate), 'Datas da CNH inválidas');
    const row = await this.db.deliverier.create({ data: {
      fullName: input.fullName.trim(), cnpj: input.cnpj.replace(/\D/g, ''), birthDate,
      license: { create: { id: input.licenseNumber, type: input.licenseType.toUpperCase(), issueDate: new Date(input.issueDate), expiryDate: new Date(input.expiryDate) } },
    } });
    return this.get(row.id);
  }
}
