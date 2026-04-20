// ══════════════════════════════════════
// Auth Service
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
import { randomUUID } from 'crypto';
import { Client } from 'ldapts';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateManagedUserDto, LdapConfigDto } from './dto/auth.dto';

type AppRole = 'ADMIN' | 'VISITOR';

interface LdapStoredConfig {
  enabled: boolean;
  url?: string;
  bindDn?: string;
  bindPassword?: string;
  userSearchBase?: string;
  userSearchFilter?: string;
  groupAttribute: string;
  adminGroupDns: string[];
  userGroupDns: string[];
}

const ROOT_IDENTIFIER = 'root';
const ROOT_DEFAULT_PASSWORD = 'root';
const LDAP_SETTING_KEY = 'AUTH_LDAP_CONFIG';
const DISABLED_USERS_SETTING_KEY = 'AUTH_DISABLED_USERS';
const DEFAULT_LDAP_FILTER = '(|(sAMAccountName={{username}})(mail={{username}})(uid={{username}}))';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async onModuleInit() {
    await this.ensureRootAccount();
  }

  async login(identifier: string, password: string) {
    const normalizedIdentifier = this.normalizeIdentifier(identifier);

    const localUser = await this.prisma.user.findUnique({
      where: { email: normalizedIdentifier },
    });

    if (localUser) {
      if (await this.isUserDisabled(localUser.id)) {
        throw new UnauthorizedException('Account disabled');
      }

      const isPasswordValid = await bcrypt.compare(password, localUser.passwordHash);
      if (isPasswordValid) {
        return this.buildAuthResponse(localUser);
      }
    }

    const ldapAuth = await this.tryLdapLogin(identifier, password);
    if (ldapAuth) {
      return ldapAuth;
    }

    throw new UnauthorizedException('Invalid credentials');
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
      throw new UnauthorizedException('User not found');
    }

    if (await this.isUserDisabled(user.id)) {
      throw new UnauthorizedException('Account disabled');
    }

    return {
      ...user,
      isRoot: this.isRootIdentifier(user.email),
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
      throw new UnauthorizedException('User not found');
    }

    if (await this.isUserDisabled(user.id)) {
      throw new UnauthorizedException('Account disabled');
    }

    return {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
  }

  async createManagedUser(callerEmail: string, dto: CreateManagedUserDto) {
    await this.assertRootAccess(callerEmail);

    const normalizedIdentifier = this.normalizeIdentifier(dto.identifier);
    if (!normalizedIdentifier) {
      throw new BadRequestException('Identifier is required');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedIdentifier },
    });

    if (existing) {
      throw new ConflictException('Identifier already registered');
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

  async listManagedUsers(callerEmail: string) {
    await this.assertRootAccess(callerEmail);

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

  async updateManagedUserRole(callerEmail: string, userId: string, role: AppRole) {
    await this.assertRootAccess(callerEmail);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (this.isRootIdentifier(user.email) && role !== 'ADMIN') {
      throw new BadRequestException('The root account must remain ADMIN');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role },
    });

    const disabledUserIds = await this.getDisabledUserIdSet();

    return this.toManagedUserResponse(updated, !disabledUserIds.has(updated.id));
  }

  async updateManagedUserStatus(callerEmail: string, userId: string, active: boolean) {
    await this.assertRootAccess(callerEmail);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (this.isRootIdentifier(user.email) && !active) {
      throw new BadRequestException('The root account cannot be deactivated');
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

  async deleteManagedUser(callerEmail: string, userId: string) {
    await this.assertRootAccess(callerEmail);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (this.isRootIdentifier(user.email)) {
      throw new BadRequestException('The root account cannot be deleted');
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

  async getLdapConfig(callerEmail: string) {
    await this.assertRootAccess(callerEmail);
    const config = await this.getLdapConfigInternal();
    return this.sanitizeLdapConfig(config);
  }

  async updateLdapConfig(callerEmail: string, dto: LdapConfigDto) {
    await this.assertRootAccess(callerEmail);

    const currentConfig = await this.getLdapConfigInternal();
    const normalized = this.normalizeLdapConfig(dto as unknown as Record<string, unknown>);

    if (normalized.bindPassword === undefined) {
      normalized.bindPassword = currentConfig.bindPassword;
    }

    const normalizedJson = normalized as unknown as Prisma.InputJsonValue;

    if (normalized.enabled) {
      if (!normalized.url) {
        throw new BadRequestException('LDAP URL is required when LDAP is enabled');
      }

      if (!normalized.userSearchBase) {
        throw new BadRequestException(
          'LDAP user search base is required when LDAP is enabled',
        );
      }
    }

    await this.prisma.systemSetting.upsert({
      where: { key: LDAP_SETTING_KEY },
      create: {
        key: LDAP_SETTING_KEY,
        value: normalizedJson,
      },
      update: {
        value: normalizedJson,
      },
    });

    return this.sanitizeLdapConfig(normalized);
  }

  private async ensureRootAccount() {
    const existingRoot = await this.prisma.user.findUnique({
      where: { email: ROOT_IDENTIFIER },
    });

    if (!existingRoot) {
      const passwordHash = await this.hashPassword(ROOT_DEFAULT_PASSWORD);
      await this.prisma.user.create({
        data: {
          email: ROOT_IDENTIFIER,
          passwordHash,
          displayName: 'Root',
          role: 'ADMIN',
        },
      });

      this.logger.warn(
        'Default root account created (identifier: root / password: root). Change it immediately in production.',
      );
      return;
    }

    if (existingRoot.role !== 'ADMIN') {
      await this.prisma.user.update({
        where: { id: existingRoot.id },
        data: { role: 'ADMIN' },
      });
      this.logger.warn('Root account role was corrected to ADMIN.');
    }
  }

  private async tryLdapLogin(identifier: string, password: string) {
    const ldapConfig = await this.getLdapConfigInternal();

    if (!ldapConfig.enabled || !ldapConfig.url || !ldapConfig.userSearchBase) {
      return null;
    }

    if (!password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const client = new Client({
      url: ldapConfig.url,
      timeout: 10000,
      connectTimeout: 10000,
    });

    try {
      if (ldapConfig.bindDn) {
        await client.bind(ldapConfig.bindDn, ldapConfig.bindPassword || '');
      }

      const escapedIdentifier = this.escapeLdapFilter(identifier.trim());
      const filterTemplate = ldapConfig.userSearchFilter || DEFAULT_LDAP_FILTER;
      const filter = filterTemplate.replaceAll('{{username}}', escapedIdentifier);

      const { searchEntries } = await client.search(ldapConfig.userSearchBase, {
        scope: 'sub',
        filter,
        sizeLimit: 2,
        attributes: [
          'dn',
          'mail',
          'userPrincipalName',
          'uid',
          'sAMAccountName',
          'cn',
          'displayName',
          ldapConfig.groupAttribute,
        ],
      });

      if (!searchEntries.length) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const userEntry = searchEntries[0] as Record<string, unknown>;
      const userDn = this.extractEntryString(userEntry, 'dn');
      if (!userDn) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // Re-bind as the LDAP user to validate password.
      await client.bind(userDn, password);

      const groups = this.extractEntryStringArray(userEntry, ldapConfig.groupAttribute);
      const mappedRole = this.resolveLdapRole(groups, ldapConfig);
      const mappedIdentifier = this.resolveLdapIdentifier(userEntry, identifier);
      const mappedDisplayName =
        this.extractEntryString(userEntry, 'displayName') ||
        this.extractEntryString(userEntry, 'cn') ||
        undefined;

      const user = await this.upsertLdapUser(
        mappedIdentifier,
        mappedDisplayName,
        mappedRole,
      );

      if (await this.isUserDisabled(user.id)) {
        throw new UnauthorizedException('Account disabled');
      }

      return this.buildAuthResponse(user);
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      this.logger.warn(`LDAP authentication failed: ${(error as Error).message}`);
      throw new UnauthorizedException('Invalid credentials');
    } finally {
      await client.unbind().catch(() => {
        // Ignore unbind errors.
      });
    }
  }

  private async upsertLdapUser(
    identifier: string,
    displayName: string | undefined,
    role: AppRole,
  ) {
    if (this.isRootIdentifier(identifier)) {
      throw new ForbiddenException('Root account cannot be managed through LDAP');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: identifier },
    });

    if (existing) {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: {
          role,
          displayName: displayName || existing.displayName,
        },
      });
    }

    return this.prisma.user.create({
      data: {
        email: identifier,
        passwordHash: await this.hashPassword(randomUUID()),
        displayName,
        role,
      },
    });
  }

  private resolveLdapRole(groups: string[], config: LdapStoredConfig): AppRole {
    const normalizedGroups = groups.map((group) => this.normalizeGroupDn(group));
    const adminGroups = config.adminGroupDns.map((group) => this.normalizeGroupDn(group));
    const userGroups = config.userGroupDns.map((group) => this.normalizeGroupDn(group));

    const inAdminGroup = adminGroups.some((group) => normalizedGroups.includes(group));
    if (inAdminGroup) {
      return 'ADMIN';
    }

    if (userGroups.length === 0) {
      return 'VISITOR';
    }

    const inUserGroup = userGroups.some((group) => normalizedGroups.includes(group));
    if (!inUserGroup) {
      throw new ForbiddenException('LDAP account is not in an allowed group');
    }

    return 'VISITOR';
  }

  private resolveLdapIdentifier(
    entry: Record<string, unknown>,
    fallbackIdentifier: string,
  ) {
    const candidate =
      this.extractEntryString(entry, 'mail') ||
      this.extractEntryString(entry, 'userPrincipalName') ||
      this.extractEntryString(entry, 'uid') ||
      this.extractEntryString(entry, 'sAMAccountName') ||
      fallbackIdentifier;

    const normalized = this.normalizeIdentifier(candidate);
    if (!normalized) {
      throw new UnauthorizedException('Invalid LDAP user mapping');
    }

    return normalized;
  }

  private async getLdapConfigInternal(): Promise<LdapStoredConfig> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: LDAP_SETTING_KEY },
    });

    if (!setting) {
      return this.normalizeLdapConfig({ enabled: false });
    }

    return this.normalizeLdapConfig(setting.value as Record<string, unknown>);
  }

  private sanitizeLdapConfig(config: LdapStoredConfig) {
    return {
      enabled: config.enabled,
      url: config.url || '',
      bindDn: config.bindDn || '',
      hasBindPassword: Boolean(config.bindPassword),
      userSearchBase: config.userSearchBase || '',
      userSearchFilter: config.userSearchFilter || DEFAULT_LDAP_FILTER,
      groupAttribute: config.groupAttribute,
      adminGroupDns: config.adminGroupDns,
      userGroupDns: config.userGroupDns,
    };
  }

  private normalizeLdapConfig(raw: Record<string, unknown>): LdapStoredConfig {
    return {
      enabled: Boolean(raw.enabled),
      url: this.normalizeOptionalString(raw.url),
      bindDn: this.normalizeOptionalString(raw.bindDn),
      bindPassword: this.normalizeOptionalString(raw.bindPassword),
      userSearchBase: this.normalizeOptionalString(raw.userSearchBase),
      userSearchFilter:
        this.normalizeOptionalString(raw.userSearchFilter) || DEFAULT_LDAP_FILTER,
      groupAttribute: this.normalizeOptionalString(raw.groupAttribute) || 'memberOf',
      adminGroupDns: this.normalizeStringArray(raw.adminGroupDns),
      userGroupDns: this.normalizeStringArray(raw.userGroupDns),
    };
  }

  private extractEntryString(
    entry: Record<string, unknown>,
    key: string,
  ): string | null {
    const value = this.readCaseInsensitiveEntry(entry, key);

    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value) && value.length > 0) {
      const first = value[0];
      if (typeof first === 'string') {
        return first;
      }
    }

    return null;
  }

  private extractEntryStringArray(
    entry: Record<string, unknown>,
    key: string,
  ): string[] {
    const value = this.readCaseInsensitiveEntry(entry, key);

    if (typeof value === 'string') {
      return [value];
    }

    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }

    return [];
  }

  private readCaseInsensitiveEntry(
    entry: Record<string, unknown>,
    key: string,
  ): unknown {
    if (Object.prototype.hasOwnProperty.call(entry, key)) {
      return entry[key];
    }

    const foundKey = Object.keys(entry).find(
      (entryKey) => entryKey.toLowerCase() === key.toLowerCase(),
    );

    return foundKey ? entry[foundKey] : undefined;
  }

  private normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
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
      isRoot: this.isRootIdentifier(user.email),
      isActive,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  private normalizeOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private normalizeIdentifier(identifier: string) {
    return identifier.trim().toLowerCase();
  }

  private normalizeGroupDn(groupDn: string) {
    return groupDn.trim().toLowerCase();
  }

  private isRootIdentifier(identifier: string) {
    return this.normalizeIdentifier(identifier) === ROOT_IDENTIFIER;
  }

  private async assertRootAccess(callerEmail: string) {
    if (!this.isRootIdentifier(callerEmail)) {
      throw new ForbiddenException('Only root can manage accounts and LDAP settings');
    }
  }

  private escapeLdapFilter(value: string) {
    return value
      .replace(/\\/g, '\\5c')
      .replace(/\*/g, '\\2a')
      .replace(/\(/g, '\\28')
      .replace(/\)/g, '\\29')
      .replace(/\0/g, '\\00');
  }

  private async hashPassword(password: string) {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(password, salt);
  }

  private buildAuthResponse(user: Pick<User, 'id' | 'email' | 'displayName' | 'role' | 'createdAt'>) {
    const token = this.generateToken(user.id, user.email, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        isRoot: this.isRootIdentifier(user.email),
        isActive: true,
        createdAt: user.createdAt.toISOString(),
      },
      accessToken: token,
    };
  }

  private generateToken(userId: string, email: string, role: string): string {
    return this.jwtService.sign({
      sub: userId,
      email,
      role,
    });
  }
}
