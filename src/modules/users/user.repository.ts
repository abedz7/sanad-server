import type { FilterQuery } from 'mongoose';
import {
  LOCKOUT_MINUTES,
  MAX_FAILED_LOGIN_ATTEMPTS,
  UserModel,
  type Role,
  type User,
  type UserDocument,
} from './user.model.js';

export interface CreateUserInput {
  email: string;
  name: string;
  passwordHash: string;
  role?: Role;
}

export interface UserListFilter {
  role?: Role;
}

export const userRepository = {
  // Only the login path may read the hash, so this is the one finder that selects it.
  findByEmailWithHash(email: string): Promise<UserDocument | null> {
    return UserModel.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash').exec();
  },

  findById(id: string): Promise<UserDocument | null> {
    return UserModel.findById(id).exec();
  },

  // Cheap liveness check for the auth middleware: one indexed lookup, one projected field.
  existsActive(id: string): Promise<boolean> {
    return UserModel.exists({ _id: id, deletedAt: null })
      .exec()
      .then((found) => found !== null);
  },

  create(input: CreateUserInput): Promise<UserDocument> {
    return UserModel.create(input);
  },

  // One atomic pipeline update: bump the counter and, if this attempt reaches the threshold, set
  // the lock in the same write. Concurrent bad attempts therefore cannot race past the threshold,
  // and a wrong password after an expired lock re-locks immediately (the counter stays >= max until
  // a successful login resets it). Returns nothing on purpose — the caller never branches on it.
  async recordFailedLogin(email: string): Promise<void> {
    const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60_000);
    await UserModel.updateOne({ email: email.toLowerCase().trim(), deletedAt: null }, [
      { $set: { failedLoginAttempts: { $add: ['$failedLoginAttempts', 1] } } },
      {
        $set: {
          lockedUntil: {
            $cond: [
              { $gte: ['$failedLoginAttempts', MAX_FAILED_LOGIN_ATTEMPTS] },
              lockedUntil,
              '$lockedUntil',
            ],
          },
        },
      },
    ]).exec();
  },

  async resetLoginState(id: string): Promise<void> {
    await UserModel.updateOne(
      { _id: id },
      { $set: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } },
    ).exec();
  },

  async listPaginated(
    filter: UserListFilter,
    page: number,
    limit: number,
  ): Promise<{ items: UserDocument[]; total: number }> {
    const query: FilterQuery<User> = { deletedAt: null };
    if (filter.role) query.role = filter.role;
    const [items, total] = await Promise.all([
      UserModel.find(query)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      UserModel.countDocuments(query).exec(),
    ]);
    return { items, total };
  },
};
