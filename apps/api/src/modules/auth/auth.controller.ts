// ══════════════════════════════════════
// Auth Controller
// ══════════════════════════════════════

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  CreateManagedUserDto,
  LdapConfigDto,
  LoginDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
} from './dto/auth.dto';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Authenticate and receive JWT token' })
  async login(@Body() dto: LoginDto) {
    return {
      success: true,
      data: await this.authService.login(dto.identifier, dto.password),
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

  @Post('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a managed user (root only)' })
  async createManagedUser(@Request() req: any, @Body() dto: CreateManagedUserDto) {
    return {
      success: true,
      data: await this.authService.createManagedUser(req.user.email, dto),
    };
  }

  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List managed users (root only)' })
  async listManagedUsers(@Request() req: any) {
    return {
      success: true,
      data: await this.authService.listManagedUsers(req.user.email),
    };
  }

  @Patch('users/:id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a managed user role (root only)' })
  async updateManagedUserRole(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return {
      success: true,
      data: await this.authService.updateManagedUserRole(
        req.user.email,
        id,
        dto.role,
      ),
    };
  }

  @Patch('users/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activate/deactivate a managed user (root only)' })
  async updateManagedUserStatus(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return {
      success: true,
      data: await this.authService.updateManagedUserStatus(
        req.user.email,
        id,
        dto.active,
      ),
    };
  }

  @Delete('users/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a managed user (root only)' })
  async deleteManagedUser(@Request() req: any, @Param('id') id: string) {
    return {
      success: true,
      data: await this.authService.deleteManagedUser(req.user.email, id),
    };
  }

  @Get('ldap/config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get LDAP configuration (root only)' })
  async getLdapConfig(@Request() req: any) {
    return {
      success: true,
      data: await this.authService.getLdapConfig(req.user.email),
    };
  }

  @Post('ldap/config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set LDAP configuration (root only)' })
  async updateLdapConfig(@Request() req: any, @Body() dto: LdapConfigDto) {
    return {
      success: true,
      data: await this.authService.updateLdapConfig(req.user.email, dto),
    };
  }
}
