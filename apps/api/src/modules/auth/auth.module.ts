// ══════════════════════════════════════
// Origineo — Auth Module
// ══════════════════════════════════════

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { OidcService } from './oidc.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'change_me',
      signOptions: {
        expiresIn: (process.env.JWT_EXPIRATION as any) || '7d',
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, OidcService, JwtStrategy],
  exports: [AuthService, OidcService, JwtModule],
})
export class AuthModule {}
