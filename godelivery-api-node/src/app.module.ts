import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { DatabaseModule } from './database/database.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { MotorcyclesModule } from './motorcycles/motorcycles.module.js';
import { DeliveriersModule } from './deliveriers/deliveriers.module.js';
import { RentalsModule } from './rentals/rentals.module.js';
import { HealthController } from './health.controller.js';
import { AuthSessionController } from './identity/auth-session.controller.js';

@Module({
  imports: [
    DatabaseModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      path: '/graphql',
      autoSchemaFile: true,
      sortSchema: true,
      context: ({ req }: { req: unknown }) => ({ req }),
      introspection: process.env.NODE_ENV !== 'production',
      playground: false,
      csrfPrevention: true,
    }),
    IdentityModule, MotorcyclesModule, DeliveriersModule, RentalsModule,
  ],
  controllers: [HealthController, AuthSessionController],
})
export class AppModule {}
