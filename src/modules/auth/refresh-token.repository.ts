import {
  RefreshTokenModel,
  type Client,
  type RefreshTokenDocument,
} from './refresh-token.model.js';

export interface IssueRefreshTokenInput {
  userId: string;
  tokenHash: string;
  familyId: string;
  client: Client;
  expiresAt: Date;
  userAgent: string;
  ip: string;
}

export const refreshTokenRepository = {
  create(input: IssueRefreshTokenInput): Promise<RefreshTokenDocument> {
    return RefreshTokenModel.create(input);
  },

  findByHash(tokenHash: string): Promise<RefreshTokenDocument | null> {
    return RefreshTokenModel.findOne({ tokenHash }).exec();
  },

  // Atomic claim: only the first caller to present a live token gets `matchedCount: 1`. A second
  // concurrent presentation sees usedAt already set and is treated as reuse by the service.
  async markUsed(id: string): Promise<boolean> {
    const result = await RefreshTokenModel.updateOne(
      { _id: id, usedAt: null, revokedAt: null },
      { $set: { usedAt: new Date() } },
    ).exec();
    return result.modifiedCount === 1;
  },

  async revokeFamily(familyId: string): Promise<void> {
    await RefreshTokenModel.updateMany(
      { familyId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    ).exec();
  },
};
