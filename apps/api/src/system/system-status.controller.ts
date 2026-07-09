import { Controller, Get, UseGuards } from "@nestjs/common";
import { SystemService } from "./system.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

// 관리자 전용인 /system/health 와 달리, 일반 로그인 사용자도 확인할 수 있는
// 비민감 상태 정보만 노출하는 별도 컨트롤러.
@Controller("system")
@UseGuards(JwtAuthGuard)
export class SystemStatusController {
  constructor(private readonly systemService: SystemService) {}

  @Get("status")
  getStatus() {
    return this.systemService.getStatus();
  }
}
