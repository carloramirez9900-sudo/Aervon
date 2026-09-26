import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  health() {
    const databaseReady = this.connection.readyState === 1;
    const payload = {
      status: databaseReady ? 'ok' : 'degraded',
      database: databaseReady ? 'connected' : 'not_connected',
      timestamp: new Date().toISOString(),
    };
    if (!databaseReady) throw new ServiceUnavailableException(payload);
    return payload;
  }
}
