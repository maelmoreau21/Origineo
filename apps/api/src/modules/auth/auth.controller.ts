// ══════════════════════════════════════
// Origineo — Auth Controller
// ══════════════════════════════════════

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { OidcService } from './oidc.service';
import {
  CreateManagedUserDto,
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
  constructor(
    private readonly authService: AuthService,
    private readonly oidcService: OidcService,
  ) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Connexion locale et génération de token JWT' })
  async login(@Body() dto: LoginDto) {
    return {
      success: true,
      data: await this.authService.login(dto.identifier, dto.password),
    };
  }

  @Public()
  @Get('oidc/config')
  @ApiOperation({ summary: 'Obtenir la configuration OIDC SSO' })
  async getOidcConfig() {
    return {
      success: true,
      data: await this.oidcService.getConfig(),
    };
  }

  @Public()
  @Get('oidc/login')
  @ApiOperation({ summary: 'Redirection vers le fournisseur SSO OIDC' })
  async oidcLogin(@Res() res: Response) {
    const authUrl = await this.oidcService.getAuthorizationUrl();
    return res.redirect(302, authUrl);
  }

  @Public()
  @Get('oidc/callback')
  @ApiOperation({ summary: 'Callback d’authentification SSO OIDC' })
  async oidcCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Res() res: Response,
  ) {
    const frontendUrl = this.oidcService.getFrontendUrl();

    if (error) {
      const message = encodeURIComponent(errorDescription || error);
      return res.redirect(302, `${frontendUrl}/admin?error=${message}`);
    }

    try {
      const user = await this.oidcService.handleCallback(code, state);
      const token = this.authService.generateToken(user.id, user.email, user.role);

      return res.redirect(302, `${frontendUrl}/admin?token=${encodeURIComponent(token)}`);
    } catch (err: any) {
      const message = encodeURIComponent(err.message || 'Échec de la connexion SSO');
      return res.redirect(302, `${frontendUrl}/admin?error=${message}`);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Profil de l’utilisateur connecté' })
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
  @ApiOperation({ summary: 'Créer un utilisateur (admin)' })
  async createManagedUser(@Request() req: any, @Body() dto: CreateManagedUserDto) {
    return {
      success: true,
      data: await this.authService.createManagedUser(req.user.role, dto),
    };
  }

  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lister les utilisateurs (admin)' })
  async listManagedUsers(@Request() req: any) {
    return {
      success: true,
      data: await this.authService.listManagedUsers(req.user.role),
    };
  }

  @Patch('users/:id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour le rôle d’un utilisateur (admin)' })
  async updateManagedUserRole(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return {
      success: true,
      data: await this.authService.updateManagedUserRole(
        req.user.role,
        id,
        dto.role,
      ),
    };
  }

  @Patch('users/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activer / désactiver un utilisateur (admin)' })
  async updateManagedUserStatus(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return {
      success: true,
      data: await this.authService.updateManagedUserStatus(
        req.user.role,
        id,
        dto.active,
      ),
    };
  }

  @Delete('users/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Supprimer un utilisateur (admin)' })
  async deleteManagedUser(@Request() req: any, @Param('id') id: string) {
    return {
      success: true,
      data: await this.authService.deleteManagedUser(req.user.role, req.user.sub, id),
    };
  }
}
