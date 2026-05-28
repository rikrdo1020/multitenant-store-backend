import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { RegisterTokenDto } from './dto/register-token.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';

interface JwtUser {
  sub: string;
  email: string;
}

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post('register-token')
  @HttpCode(HttpStatus.OK)
  registerToken(@CurrentUser() user: JwtUser, @Body() dto: RegisterTokenDto) {
    return this.notificationService.registerToken(user.sub, dto);
  }

  @Get()
  findAll(@CurrentUser() user: JwtUser) {
    return this.notificationService.findAll(user.sub);
  }

  @Put(':id/read')
  @HttpCode(HttpStatus.OK)
  markAsRead(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.notificationService.markAsRead(id, user.sub);
  }
}
