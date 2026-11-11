import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaService } from '../database/prisma.service.js';

const db = new PrismaService();
try {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD (12+ chars) are required');
  await db.user.upsert({ where: { email }, create: { email, name: 'Administrador', role: 'admin', passwordHash: await argon2.hash(password) }, update: {} });
  for (const name of ['Honda Pop', 'Honda CG 160', 'Yamaha Factor']) {
    await db.motorcycleModel.upsert({ where: { normalized: name.replace(/\W/g, '').toUpperCase() }, create: { name, normalized: name.replace(/\W/g, '').toUpperCase() }, update: {} });
  }
  for (const [days, dailyCost] of [[7, 100], [15, 100], [30, 100], [45, 100], [50, 100]] as const) {
    await db.rentalPlan.upsert({ where: { name: `${days} dias` }, create: { name: `${days} dias`, days, dailyCost }, update: {} });
  }
} finally { await db.$disconnect(); }
