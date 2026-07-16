import { Controller, Get } from '@nestjs/common';
import { SystemService } from './system.service';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

@Controller('system')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('health')
  getHealth() {
    return this.systemService.getHealth();
  }
}
