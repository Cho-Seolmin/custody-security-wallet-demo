import { Body, Controller, Get, Put, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { SettingsService } from "./settings.service";
import { UpdatePreferencesDto } from "./dto/update-preferences.dto";

@Controller("settings")
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get("preferences")
  getPreferences(@Req() req: any) {
    return this.settingsService.getPreferences(req.user.sub);
  }

  @Put("preferences")
  updatePreferences(@Req() req: any, @Body() dto: UpdatePreferencesDto) {
    return this.settingsService.updatePreferences(req.user.sub, dto);
  }
}
