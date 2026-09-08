// ══════════════════════════════════════
// Origineo — Auth Service
// ══════════════════════════════════════

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateManagedUserDto } from './dto/auth.dto';

type AppRole = 'ADMIN' | 'VISITOR';

const DISABLED_USERS_SETTING_KEY = 'AUTH_DISABLED_USERS';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async onModuleInit() {
    await this.ensureLocalAdminAccount();
  }

  getLocalAdminEmail(): string {
    return (process.env.LOCAL_ADMIN_EMAIL || 'admin@origineo.local').trim().toLowerCase();
  }

  getLocalAdminPassword(): string {
    return process.env.LOCAL_ADMIN_PASSWORD || 'admin';
  }

  getLocalAdminName(): string {
    return process.env.LOCAL_ADMIN_NAME || 'Administrateur Local';
  }

  async login(identifier: string, password: string) {
    const normalizedIdentifier = this.normalizeIdentifier(identifier);
    const adminEmail = this.getLocalAdminEmail();

    let localUser = await this.prisma.user.findUnique({
      where: { email: normalizedIdentifier },
    });

    // Support logging in with 'admin', 'root', or adminEmail aliases for the administrator account
    if (!localUser && (
      normalizedIdentifier === 'admin' ||
      normalizedIdentifier === 'root' ||
      normalizedIdentifier === 'admin@origineo.local' ||
      normalizedIdentifier === adminEmail ||
      normalizedIdentifier === adminEmail.split('@')[0]
    )) {
      localUser = await this.prisma.user.findUnique({
        where: { email: adminEmail },
      });
      if (!localUser) {
        localUser = await this.prisma.user.findFirst({
          where: { role: 'ADMIN' },
          orderBy: { createdAt: 'asc' },
        });
      }
    }

    if (localUser) {
      if (await this.isUserDisabled(localUser.id)) {
        throw new UnauthorizedException('Compte désactivé');
      }

      const isPasswordValid = await bcrypt.compare(password, localUser.passwordHash);
      if (isPasswordValid) {
        return this.buildAuthResponse(localUser);
      }
    }

    throw new UnauthorizedException('Identifiants invalides');
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    if (await this.isUserDisabled(user.id)) {
      throw new UnauthorizedException('Compte désactivé');
    }

    return {
      ...user,
      isLocalAdmin: user.email === this.getLocalAdminEmail() || user.role === 'ADMIN',
      isActive: true,
    };
  }

  async validateSessionUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    if (await this.isUserDisabled(user.id)) {
      throw new UnauthorizedException('Compte désactivé');
    }

    return {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
  }

  async createManagedUser(callerRole: string, dto: CreateManagedUserDto) {
    this.assertAdminAccess(callerRole);

    const normalizedIdentifier = this.normalizeIdentifier(dto.identifier);
    if (!normalizedIdentifier) {
      throw new BadRequestException('Un identifiant ou email est requis');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedIdentifier },
    });

    if (existing) {
      throw new ConflictException('Cet identifiant est déjà utilisé');
    }

    const passwordHash = await this.hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: normalizedIdentifier,
        passwordHash,
        displayName: dto.displayName?.trim() || undefined,
        role: dto.role || 'VISITOR',
      },
    });

    return this.toManagedUserResponse(user, true);
  }

  async listManagedUsers(callerRole: string) {
    this.assertAdminAccess(callerRole);

    const disabledUserIds = await this.getDisabledUserIdSet();

    const users = await this.prisma.user.findMany({
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return users.map((user) =>
      this.toManagedUserResponse(user, !disabledUserIds.has(user.id)),
    );
  }

  async updateManagedUserRole(callerRole: string, userId: string, role: AppRole) {
    this.assertAdminAccess(callerRole);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('Utilisateur introuvable');
    }

    const isPrimaryAdmin = user.email === this.getLocalAdminEmail();
    if (isPrimaryAdmin && role !== 'ADMIN') {
      throw new BadRequestException('Le compte administrateur principal doit conserver le rôle ADMIN');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role },
    });

    const disabledUserIds = await this.getDisabledUserIdSet();

    return this.toManagedUserResponse(updated, !disabledUserIds.has(updated.id));
  }

  async updateManagedUserStatus(callerRole: string, userId: string, active: boolean) {
    this.assertAdminAccess(callerRole);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('Utilisateur introuvable');
    }

    const isPrimaryAdmin = user.email === this.getLocalAdminEmail();
    if (isPrimaryAdmin && !active) {
      throw new BadRequestException('Le compte administrateur local ne peut pas être désactivé');
    }

    const disabledUserIds = await this.getDisabledUserIdSet();
    if (active) {
      disabledUserIds.delete(user.id);
    } else {
      disabledUserIds.add(user.id);
    }

    await this.setDisabledUserIds(Array.from(disabledUserIds));

    return this.toManagedUserResponse(user, active);
  }

  async deleteManagedUser(callerRole: string, callerId: string, userId: string) {
    this.assertAdminAccess(callerRole);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('Utilisateur introuvable');
    }

    if (user.id === callerId) {
      throw new BadRequestException('Vous ne pouvez pas supprimer votre propre compte');
    }

    if (user.email === this.getLocalAdminEmail()) {
      throw new BadRequestException('Le compte administrateur local configuré dans docker-compose ne peut pas être supprimé');
    }

    const disabledUserIds = await this.getDisabledUserIdSet();
    if (disabledUserIds.has(user.id)) {
      disabledUserIds.delete(user.id);
      await this.setDisabledUserIds(Array.from(disabledUserIds));
    }

    await this.prisma.user.delete({ where: { id: user.id } });

    return {
      id: user.id,
      identifier: user.email,
      deleted: true,
    };
  }

  public async ensureLocalAdminAccount() {
    const adminEmail = this.getLocalAdminEmail();
    const adminPassword = this.getLocalAdminPassword();
    const adminName = this.getLocalAdminName();

    let existingAdmin = await this.prisma.user.findUnique({
      where: { email: adminEmail },
    });

    if (!existingAdmin) {
      existingAdmin = await this.prisma.user.findFirst({
        where: {
          OR: [
            { email: 'admin' },
            { email: 'admin@origineo.local' },
            { role: 'ADMIN' },
          ],
        },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (!existingAdmin) {
      const passwordHash = await this.hashPassword(adminPassword);
      await this.prisma.user.create({
        data: {
          email: adminEmail,
          passwordHash,
          displayName: adminName,
          role: 'ADMIN',
        },
      });

      this.logger.log(
        `Compte administrateur local initialisé (${adminEmail}).`,
      );
      return;
    }

    // Sync role and password hash from docker-compose if configured
    const updates: Prisma.UserUpdateInput = {};
    if (existingAdmin.role !== 'ADMIN') {
      updates.role = 'ADMIN';
    }

    const isCurrentPasswordMatching = await bcrypt.compare(
      adminPassword,
      existingAdmin.passwordHash,
    );
    if (!isCurrentPasswordMatching) {
      updates.passwordHash = await this.hashPassword(adminPassword);
      this.logger.log(`Mot de passe du compte administrateur (${existingAdmin.email}) synchronisé depuis les variables d'environnement.`);
    }

    if (Object.keys(updates).length > 0) {
      await this.prisma.user.update({
        where: { id: existingAdmin.id },
        data: updates,
      });
    }
  }

  private async getDisabledUserIdSet(): Promise<Set<string>> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: DISABLED_USERS_SETTING_KEY },
      select: { value: true },
    });

    if (!setting) {
      return new Set<string>();
    }

    const raw = setting.value as unknown;
    if (!Array.isArray(raw)) {
      return new Set<string>();
    }

    return new Set(
      raw
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    );
  }

  private async setDisabledUserIds(userIds: string[]) {
    const sanitized = Array.from(
      new Set(userIds.map((item) => item.trim()).filter((item) => item.length > 0)),
    );

    await this.prisma.systemSetting.upsert({
      where: { key: DISABLED_USERS_SETTING_KEY },
      create: {
        key: DISABLED_USERS_SETTING_KEY,
        value: sanitized as unknown as Prisma.InputJsonValue,
      },
      update: {
        value: sanitized as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async isUserDisabled(userId: string): Promise<boolean> {
    const disabledUserIds = await this.getDisabledUserIdSet();
    return disabledUserIds.has(userId);
  }

  private toManagedUserResponse(
    user: Pick<User, 'id' | 'email' | 'displayName' | 'role' | 'createdAt' | 'updatedAt'>,
    isActive: boolean,
  ) {
    return {
      id: user.id,
      identifier: user.email,
      displayName: user.displayName,
      role: user.role,
      isLocalAdmin: user.email === this.getLocalAdminEmail() || user.role === 'ADMIN',
      isActive,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  private normalizeIdentifier(identifier: string) {
    return identifier.trim().toLowerCase();
  }

  private assertAdminAccess(callerRole: string) {
    if (callerRole !== 'ADMIN') {
      throw new ForbiddenException('Accès réservé aux administrateurs');
    }
  }

  private async hashPassword(password: string) {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(password, salt);
  }

  public buildAuthResponse(user: Pick<User, 'id' | 'email' | 'displayName' | 'role' | 'createdAt'>) {
    const token = this.generateToken(user.id, user.email, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        isLocalAdmin: user.email === this.getLocalAdminEmail() || user.role === 'ADMIN',
        isActive: true,
        createdAt: user.createdAt.toISOString(),
      },
      accessToken: token,
    };
  }

  public generateToken(userId: string, email: string, role: string): string {
    return this.jwtService.sign({
      sub: userId,
      email,
      role,
    });
  }
}
