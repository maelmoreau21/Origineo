// ══════════════════════════════════════
// Auth Controller
// ══════════════════════════════════════

import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  async register(@Body() dto: RegisterDto) {
    return {
      success: true,
      data: await this.authService.register(
        dto.email,
        dto.password,
        dto.displayName,
      ),
    };
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Authenticate and receive JWT token' })
  async login(@Body() dto: LoginDto) {
    return {
      success: true,
      data: await this.authService.login(dto.email, dto.password),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@Request() req: any) {
    return {
      success: true,
      data: await this.authService.validateUser(req.user.sub),
    };
  }
}
