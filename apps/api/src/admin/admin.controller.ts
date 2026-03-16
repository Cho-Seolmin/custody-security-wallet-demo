import { Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AdminGuard } from "../auth/guards/admin.guard";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("withdraws")
  listWithdraws(@Query("status") status?: "PENDING" | "EXECUTED" | "REJECTED") {
    return this.admin.listWithdraws(status);
  }

  @Post("withdraws/:id/approve")
  approve(@Req() req: any, @Param("id") id: string) {
    return this.admin.approveWithdraw(id, req.user.sub);
  }
  
  @Post("withdraws/:id/reject")
  reject(@Req() req: any, @Param("id") id: string) {
    return this.admin.rejectWithdraw(id, req.user.sub);
  }

}