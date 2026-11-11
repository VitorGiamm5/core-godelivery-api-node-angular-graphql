import { BadRequestException, NotFoundException } from '@nestjs/common';

export function requireEntity<T>(value: T | null | undefined, label: string): T {
  if (!value) throw new NotFoundException(`${label} não encontrado`);
  return value;
}

export function requireBusiness(condition: unknown, message: string): asserts condition {
  if (!condition) throw new BadRequestException(message);
}
