import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import amqp, { type ChannelModel, type ConfirmChannel } from 'amqplib';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private readonly queue = 'godelivery-node-motorcycle-notification';

  constructor(private readonly db: PrismaService) {}

  async onModuleInit() {
    if (!process.env.RABBITMQ_URL) return;
    try {
      this.connection = await amqp.connect(process.env.RABBITMQ_URL);
      this.channel = await this.connection.createConfirmChannel();
      await this.channel.assertQueue(this.queue, { durable: true });
      await this.channel.prefetch(1);
      await this.channel.consume(this.queue, async message => {
        if (!message) return;
        try {
          const payload = JSON.parse(message.content.toString()) as { motorcycleId: string; year: number };
          await this.db.notification.create({ data: { motorcycleId: payload.motorcycleId, year: payload.year } });
          this.channel?.ack(message);
        } catch (error) {
          this.logger.error('Notification processing failed', error);
          this.channel?.nack(message, false, false);
        }
      });
    } catch (error) {
      this.logger.error('RabbitMQ connection failed', error);
      throw error;
    }
  }

  async publishMotorcycle(motorcycleId: string, year: number) {
    if (!this.channel) throw new Error('RabbitMQ is not ready');
    this.channel.sendToQueue(this.queue, Buffer.from(JSON.stringify({ motorcycleId, year })), { persistent: true });
    await this.channel.waitForConfirms();
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }
}
