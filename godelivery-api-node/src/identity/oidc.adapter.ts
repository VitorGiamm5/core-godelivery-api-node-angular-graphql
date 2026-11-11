import type { Adapter, AdapterPayload } from 'oidc-provider';
import { PrismaService } from '../database/prisma.service.js';

export class OidcAdapter implements Adapter {
  constructor(private readonly type: string, private readonly db: PrismaService) {}
  private key(id: string) { return `${this.type}:${id}`; }

  async upsert(id: string, payload: AdapterPayload, expiresIn?: number) {
    const data = {
      type: this.type,
      payload: payload as any,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
      grantId: payload.grantId ?? null,
      userCode: payload.userCode ?? null,
      uid: payload.uid ?? null,
    };
    await this.db.oidcRecord.upsert({ where: { id: this.key(id) }, create: { id: this.key(id), ...data }, update: data });
  }

  async find(id: string) {
    const record = await this.db.oidcRecord.findUnique({ where: { id: this.key(id) } });
    if (!record || (record.expiresAt && record.expiresAt < new Date())) return undefined;
    return record.payload as AdapterPayload;
  }

  async findByUserCode(userCode: string) {
    const record = await this.db.oidcRecord.findUnique({ where: { userCode } });
    return record ? this.find(record.id.slice(this.type.length + 1)) : undefined;
  }

  async findByUid(uid: string) {
    const record = await this.db.oidcRecord.findUnique({ where: { uid } });
    return record ? this.find(record.id.slice(this.type.length + 1)) : undefined;
  }

  async consume(id: string) {
    const payload = await this.find(id);
    if (payload) await this.upsert(id, { ...payload, consumed: Math.floor(Date.now() / 1000) });
  }

  async destroy(id: string) { await this.db.oidcRecord.deleteMany({ where: { id: this.key(id) } }); }
  async revokeByGrantId(grantId: string) { await this.db.oidcRecord.deleteMany({ where: { grantId } }); }
}
