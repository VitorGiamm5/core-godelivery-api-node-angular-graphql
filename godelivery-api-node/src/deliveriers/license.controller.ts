import { Body, Controller, Get, Param, Post, Res, UseGuards, BadRequestException, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import bmp from 'bmp-js';
import { AuthGuard } from '../common/auth.guard.js';
import { PrismaService } from '../database/prisma.service.js';

@Controller('api/licenses')
@UseGuards(AuthGuard)
export class LicenseController {
  private readonly bucket = process.env.S3_BUCKET ?? 'godelivery-node-cnh';
  private readonly s3 = new S3Client({
    region: 'us-east-1', endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? '', secretAccessKey: process.env.S3_SECRET_KEY ?? '' },
  });

  constructor(private readonly db: PrismaService) {}

  @Post(':id/file')
  async upload(@Param('id') id: string, @Body() body: { licenseImageBase64?: string }) {
    const license = await this.db.license.findUnique({ where: { id } });
    if (!license) throw new NotFoundException('CNH não encontrada');
    const data = Buffer.from(body.licenseImageBase64 ?? '', 'base64');
    if (data.length < 10 || data.length > 10_000_000) throw new BadRequestException('Imagem inválida');
    let format: 'png' | 'bmp';
    try {
      if (data.toString('ascii', 0, 2) === 'BM') {
        const width = data.readInt32LE(18);
        const height = Math.abs(data.readInt32LE(22));
        if (width < 1 || height < 1 || width > 10_000 || height > 10_000 || width * height > 12_000_000) throw new Error('BMP dimensions invalid');
        const decoded = bmp.decode(data);
        if (decoded.width !== width || decoded.height !== height) throw new Error('BMP decode failed');
        format = 'bmp';
      } else {
        const metadata = await sharp(data).metadata();
        if (metadata.format !== 'png' || !metadata.width || !metadata.height || metadata.width > 10_000 || metadata.height > 10_000 || metadata.width * metadata.height > 12_000_000) throw new Error('PNG dimensions invalid');
        await sharp(data).raw().toBuffer();
        format = 'png';
      }
    } catch { throw new BadRequestException('Formato ou dimensão de imagem inválida'); }
    const contentType = format === 'png' ? 'image/png' : 'image/bmp';
    const key = `licenses/${id}.${format}`;
    try { await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket })); }
    catch { await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket })); }
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType }));
    try { await this.db.license.update({ where: { id }, data: { objectKey: key, mimeType: contentType } }); }
    catch (error) { await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })); throw error; }
    return { message: 'License image accepted', metadata: { id, objectKey: key, contentType } };
  }

  @Get(':id/file')
  async download(@Param('id') id: string, @Res() response: Response) {
    const license = await this.db.license.findUnique({ where: { id } });
    if (!license?.objectKey) throw new NotFoundException('Imagem de CNH não encontrada');
    const result = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: license.objectKey }));
    response.type(license.mimeType ?? 'application/octet-stream');
    response.setHeader('Cache-Control', 'private, no-store');
    const body = result.Body?.transformToWebStream();
    if (!body) throw new NotFoundException('Imagem de CNH não encontrada');
    const reader = body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      response.write(Buffer.from(value));
    }
    response.end();
  }
}
