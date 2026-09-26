import { SetMetadata } from '@nestjs/common';
import { ADMIN_ROLES_KEY, AdminRole } from './admin.types';

export const RequireAdminRoles = (...roles: AdminRole[]) => SetMetadata(ADMIN_ROLES_KEY, roles);
