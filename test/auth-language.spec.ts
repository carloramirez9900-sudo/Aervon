import { BadRequestException } from '@nestjs/common';
import { AuthService } from '../src/auth/auth.service';

describe('Account preferred language', () => {
  it('rejects unsupported language values before touching MongoDB', async () => {
    const users = { findByIdAndUpdate: jest.fn() };
    const service = Object.assign(Object.create(AuthService.prototype), { users }) as AuthService;
    await expect(service.updateLanguage('507f1f77bcf86cd799439011', 'fr' as 'en')).rejects.toBeInstanceOf(BadRequestException);
    expect(users.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('persists English and Spanish only on the authenticated account', async () => {
    const users = { findByIdAndUpdate: jest.fn(async (_id: string, update: { $set: { preferredLanguage: 'en' | 'es' } }) => ({ preferredLanguage: update.$set.preferredLanguage })) };
    const service = Object.assign(Object.create(AuthService.prototype), { users }) as AuthService;
    await expect(service.updateLanguage('507f1f77bcf86cd799439011', 'es')).resolves.toEqual({ preferredLanguage: 'es' });
    expect(users.findByIdAndUpdate).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      { $set: { preferredLanguage: 'es' } },
      { new: true },
    );
  });
});
