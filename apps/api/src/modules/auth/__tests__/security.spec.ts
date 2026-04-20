// ══════════════════════════════════════
// Unit Tests — Route Security (RBAC)
// ══════════════════════════════════════
// Verifies that:
// - Public routes are accessible without auth
// - ADMIN routes reject unauthenticated requests
// - ADMIN routes reject VISITOR role
// - Guards work correctly in isolation

import { describe, it, expect } from 'vitest';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';

// ─── Helper: Fake ExecutionContext ───────────
function createMockContext(user: any | null, metadata: any = {}): ExecutionContext {
  const handler = () => {};
  const cls = class {};

  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    getArgs: () => [],
    getArgByIndex: () => null,
    switchToRpc: () => ({} as any),
    switchToWs: () => ({} as any),
    getType: () => 'http',
  } as unknown as ExecutionContext;
}

// ─── Helper: Fake Reflector ─────────────────
function createMockReflector(roles: string[] | null): Reflector {
  return {
    getAllAndOverride: () => roles,
    get: () => roles,
    getAll: () => [roles],
    getAllAndMerge: () => roles || [],
  } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('should allow access when no roles are required', () => {
    const reflector = createMockReflector(null);
    const guard = new RolesGuard(reflector);
    const context = createMockContext({ role: 'VISITOR' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access when roles array is empty', () => {
    const reflector = createMockReflector([]);
    const guard = new RolesGuard(reflector);
    const context = createMockContext({ role: 'VISITOR' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow ADMIN to access ADMIN routes', () => {
    const reflector = createMockReflector(['ADMIN']);
    const guard = new RolesGuard(reflector);
    const context = createMockContext({ role: 'ADMIN' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should reject VISITOR from ADMIN routes', () => {
    const reflector = createMockReflector(['ADMIN']);
    const guard = new RolesGuard(reflector);
    const context = createMockContext({ role: 'VISITOR' });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should reject unauthenticated user from ADMIN routes', () => {
    const reflector = createMockReflector(['ADMIN']);
    const guard = new RolesGuard(reflector);
    const context = createMockContext(null);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should reject user with undefined role', () => {
    const reflector = createMockReflector(['ADMIN']);
    const guard = new RolesGuard(reflector);
    const context = createMockContext({ role: undefined });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should support multiple required roles', () => {
    const reflector = createMockReflector(['ADMIN', 'MODERATOR']);
    const guard = new RolesGuard(reflector);

    const adminContext = createMockContext({ role: 'ADMIN' });
    expect(guard.canActivate(adminContext)).toBe(true);

    const modContext = createMockContext({ role: 'MODERATOR' });
    expect(guard.canActivate(modContext)).toBe(true);

    const visitorContext = createMockContext({ role: 'VISITOR' });
    expect(() => guard.canActivate(visitorContext)).toThrow(ForbiddenException);
  });
});

describe('Route Security Matrix', () => {
  // This documents the expected security configuration for all routes.
  // The actual enforcement is done by global guards + decorators + service checks.
  // Root-only routes still require ADMIN at guard level, then root is enforced in service.

  const routes = [
    // Public routes (no auth required)
    { path: 'POST /api/auth/login', auth: 'public' },

    // JWT routes (authenticated users)
    { path: 'GET /api/auth/me', auth: 'jwt' },
    { path: 'GET /api/persons', auth: 'jwt' },
    { path: 'GET /api/persons/root', auth: 'jwt' },
    { path: 'GET /api/persons/:id', auth: 'jwt' },
    { path: 'GET /api/relationships/person/:id', auth: 'jwt' },
    { path: 'GET /api/unions', auth: 'jwt' },
    { path: 'GET /api/unions/person/:id', auth: 'jwt' },
    { path: 'GET /api/unions/:id', auth: 'jwt' },
    { path: 'GET /api/tree/:id', auth: 'jwt' },
    { path: 'GET /api/tree/relationship/:a/:b', auth: 'jwt' },
    { path: 'GET /api/search', auth: 'jwt' },
    { path: 'GET /api/gedcom/export', auth: 'jwt' },
    { path: 'GET /api/documents/person/:id', auth: 'jwt' },
    { path: 'GET /api/documents/union/:id', auth: 'jwt' },
    { path: 'GET /api/documents/:id', auth: 'jwt' },
    { path: 'GET /api/documents/:id/download', auth: 'jwt' },
    { path: 'GET /api/documents/:id/view', auth: 'jwt' },

    // Admin routes
    { path: 'POST /api/persons', auth: 'admin' },
    { path: 'PATCH /api/persons/:id', auth: 'admin' },
    { path: 'DELETE /api/persons/:id', auth: 'admin' },
    { path: 'POST /api/relationships', auth: 'admin' },
    { path: 'DELETE /api/relationships/:id', auth: 'admin' },
    { path: 'POST /api/unions', auth: 'admin' },
    { path: 'PATCH /api/unions/:id', auth: 'admin' },
    { path: 'DELETE /api/unions/:id', auth: 'admin' },
    { path: 'POST /api/gedcom/import', auth: 'admin' },
    { path: 'POST /api/gedcom/merge/analyze', auth: 'admin' },
    { path: 'POST /api/gedcom/merge/apply', auth: 'admin' },
    { path: 'POST /api/documents/upload', auth: 'admin' },
    { path: 'DELETE /api/documents/:id', auth: 'admin' },

    // Root-managed routes (admin at guard level, root in service)
    { path: 'POST /api/auth/users', auth: 'root' },
    { path: 'GET /api/auth/users', auth: 'root' },
    { path: 'PATCH /api/auth/users/:id/role', auth: 'root' },
    { path: 'GET /api/auth/ldap/config', auth: 'root' },
    { path: 'POST /api/auth/ldap/config', auth: 'root' },
  ];

  it('should have correct number of public routes', () => {
    const publicRoutes = routes.filter((r) => r.auth === 'public');
    expect(publicRoutes.length).toBe(1);
  });

  it('should have correct number of authenticated JWT routes', () => {
    const jwtRoutes = routes.filter((r) => r.auth === 'jwt');
    expect(jwtRoutes.length).toBe(17);
  });

  it('should have correct number of admin routes', () => {
    const adminRoutes = routes.filter((r) => r.auth === 'admin');
    expect(adminRoutes.length).toBe(13);
  });

  it('should have correct number of root-managed routes', () => {
    const rootRoutes = routes.filter((r) => r.auth === 'root');
    expect(rootRoutes.length).toBe(5);
  });

  it('all routes except login should require authentication', () => {
    const nonLoginRoutes = routes.filter((r) => r.path !== 'POST /api/auth/login');

    for (const route of nonLoginRoutes) {
      expect(route.auth, `${route.path} should not be public`).not.toBe('public');
    }
  });

  it('all write operations (POST/PATCH/DELETE) on domain entities should require admin', () => {
    const writeRoutes = routes.filter(
      (r) =>
        (r.path.startsWith('POST') || r.path.startsWith('PATCH') || r.path.startsWith('DELETE')) &&
        !r.path.includes('/auth/'),
    );

    for (const route of writeRoutes) {
      expect(
        route.auth,
        `${route.path} should require admin`,
      ).toBe('admin');
    }
  });

  it('all GET routes on domain entities should require JWT', () => {
    const getRoutes = routes.filter(
      (r) => r.path.startsWith('GET') && !r.path.includes('/auth/'),
    );

    for (const route of getRoutes) {
      expect(
        route.auth,
        `${route.path} should require JWT`,
      ).toBe('jwt');
    }
  });
});
