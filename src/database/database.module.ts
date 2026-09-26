import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const uri = config.get<string>('MONGODB_URI');
        if (!uri) {
          throw new Error('MONGODB_URI is required');
        }

        return {
          uri,
          dbName: config.get<string>('MONGODB_DB_NAME') ?? 'unified_investment',
          retryWrites: true,
          w: 'majority',
          maxPoolSize: Number(config.get<string>('MONGODB_MAX_POOL_SIZE') ?? 20),
          serverSelectionTimeoutMS: 10_000,
        };
      },
    }),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
