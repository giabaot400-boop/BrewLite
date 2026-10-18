import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    // Endpoint kiểm tra tiến trình API, không kiểm tra kết nối database.
    return { status: 'ok', service: 'brewlite-api' };
  }
}
