import { eq, and, inArray, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db, users, userTeamAssignments } from '../db';
import {
  validateEmailDomain,
  generateInviteToken,
  generateResetToken,
  hashPassword,
  validatePassword,
  AuthError,
} from './AuthService';
import type { UserRole } from '../middleware/auth';

export interface InviteUserInput {
  email: string;
  fullName: string;
  role: UserRole;
  teamIds?: string[];
  invitedByRole: UserRole;
}

export interface UserRow {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
  isActive: boolean;
  tokenVersion: number;
  createdAt: Date;
  lastLoginAt: Date | null;
}

// ─── Role elevation rules ─────────────────────────────────────────────────────

function assertCanAssignRole(assignerRole: UserRole, targetRole: UserRole) {
  if ((targetRole === 'admin' || targetRole === 'board') && assignerRole !== 'admin') {
    throw new AuthError('Only admins can assign the admin or board role.', 403);
  }
  if (
    (targetRole === 'head_coach' || targetRole === 'assistant_coach') &&
    assignerRole !== 'admin' && assignerRole !== 'board'
  ) {
    throw new AuthError('Only admins or board members can assign coach roles.', 403);
  }
}

// ─── Invite ───────────────────────────────────────────────────────────────────

export async function inviteUser(input: InviteUserInput): Promise<{ userId: string; inviteToken: string }> {
  const normalizedEmail = input.email.toLowerCase().trim();

  // Domain allowlist check
  const domainOk = await validateEmailDomain(normalizedEmail);
  if (!domainOk) {
    throw new AuthError(`Email domain is not in the allowed list.`, 403);
  }

  // Role elevation check
  assertCanAssignRole(input.invitedByRole, input.role);

  // Duplicate check
  const [existing] = await db.select({ id: users.id })
    .from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (existing) throw new AuthError('An account with this email already exists.', 409);

  const { raw, exp } = generateInviteToken();

  const [user] = await db.insert(users).values({
    email: normalizedEmail,
    fullName: input.fullName,
    role: input.role,
    inviteToken: raw,
    inviteTokenExp: exp,
  }).returning({ id: users.id });

  // Assign teams if provided (coaches require at least one team)
  if (input.teamIds?.length) {
    await db.insert(userTeamAssignments).values(
      input.teamIds.map((teamId) => ({
        userId: user.id,
        teamId,
        roleAtTeam: (input.role === 'assistant_coach' ? 'assistant_coach' : 'head_coach') as 'head_coach' | 'assistant_coach',
      }))
    ).onConflictDoNothing();
  }

  return { userId: user.id, inviteToken: raw };
}

// ─── Activate account ─────────────────────────────────────────────────────────

export async function activateAccount(rawToken: string, password: string): Promise<UserRow> {
  const [user] = await db.select().from(users)
    .where(eq(users.inviteToken, rawToken)).limit(1);

  if (!user) throw new AuthError('Invalid or expired invitation link.', 400);
  if (!user.inviteTokenExp || user.inviteTokenExp < new Date()) {
    throw new AuthError('This invitation link has expired. Ask an admin to resend it.', 400);
  }

  // Re-validate domain at activation time
  const domainOk = await validateEmailDomain(user.email);
  if (!domainOk) throw new AuthError('Your email domain is no longer permitted.', 403);

  const pwResult = await validatePassword(password);
  if (!pwResult.valid) throw new AuthError(pwResult.message!, 400);

  const passwordHash = await hashPassword(password);

  const [updated] = await db.update(users).set({
    passwordHash,
    emailVerified: true,
    inviteToken: null,
    inviteTokenExp: null,
  }).where(eq(users.id, user.id)).returning();

  return updated as UserRow;
}

// ─── Force password reset ─────────────────────────────────────────────────────

export async function forcePasswordReset(targetUserId: string): Promise<{ resetToken: string }> {
  const [user] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
  if (!user) throw new AuthError('User not found.', 404);

  const { raw, exp } = generateResetToken();

  // Increment token_version to immediately invalidate all active JWTs
  await db.update(users).set({
    resetToken: raw,
    resetTokenExp: exp,
    tokenVersion: user.tokenVersion + 1,
  }).where(eq(users.id, targetUserId));

  return { resetToken: raw };
}

// ─── Complete password reset ──────────────────────────────────────────────────

export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const [user] = await db.select().from(users)
    .where(eq(users.resetToken, rawToken)).limit(1);

  if (!user) throw new AuthError('Invalid or expired reset link.', 400);
  if (!user.resetTokenExp || user.resetTokenExp < new Date()) {
    throw new AuthError('This reset link has expired.', 400);
  }

  const pwResult = await validatePassword(newPassword);
  if (!pwResult.valid) throw new AuthError(pwResult.message!, 400);

  const passwordHash = await hashPassword(newPassword);

  await db.update(users).set({
    passwordHash,
    resetToken: null,
    resetTokenExp: null,
  }).where(eq(users.id, user.id));
}

// ─── Resend invite ────────────────────────────────────────────────────────────

export async function resendInvite(userId: string): Promise<{ inviteToken: string }> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new AuthError('User not found.', 404);
  if (user.emailVerified) throw new AuthError('Account is already activated.', 400);

  const { raw, exp } = generateInviteToken();
  await db.update(users).set({ inviteToken: raw, inviteTokenExp: exp }).where(eq(users.id, userId));
  return { inviteToken: raw };
}

// ─── Deactivate / reactivate / delete ────────────────────────────────────────

export async function deactivateUser(userId: string, requesterId: string): Promise<void> {
  if (userId === requesterId) throw new AuthError('You cannot deactivate your own account.', 400);
  const [user] = await db.select({ tokenVersion: users.tokenVersion }).from(users).where(eq(users.id, userId)).limit(1);
  await db.update(users).set({ isActive: false, tokenVersion: (user?.tokenVersion ?? 0) + 1 }).where(eq(users.id, userId));
}

export async function reactivateUser(userId: string): Promise<void> {
  await db.update(users).set({ isActive: true }).where(eq(users.id, userId));
}

export async function deleteUser(userId: string, requesterId: string): Promise<void> {
  if (userId === requesterId) throw new AuthError('You cannot delete your own account.', 400);
  await db.delete(users).where(eq(users.id, userId));
}

// ─── Update user ──────────────────────────────────────────────────────────────

export async function updateUser(
  userId: string,
  patch: { fullName?: string; role?: UserRole; teamIds?: string[] },
  updaterRole: UserRole,
): Promise<void> {
  if (patch.role) assertCanAssignRole(updaterRole, patch.role);

  if (patch.fullName || patch.role) {
    await db.update(users).set({
      ...(patch.fullName ? { fullName: patch.fullName } : {}),
      ...(patch.role ? { role: patch.role } : {}),
    }).where(eq(users.id, userId));
  }

  if (patch.teamIds !== undefined) {
    await db.delete(userTeamAssignments).where(eq(userTeamAssignments.userId, userId));
    if (patch.teamIds.length > 0) {
      const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
      const roleAtTeam = user?.role === 'assistant_coach' ? 'assistant_coach' : 'head_coach';
      await db.insert(userTeamAssignments).values(
        patch.teamIds.map((teamId) => ({ userId, teamId, roleAtTeam: roleAtTeam as 'head_coach' | 'assistant_coach' }))
      );
    }
  }
}

// ─── List users ───────────────────────────────────────────────────────────────

export async function listUsers(): Promise<(UserRow & { teamIds: string[] })[]> {
  const userRows = await db.select({
    id: users.id,
    fullName: users.fullName,
    email: users.email,
    role: users.role,
    emailVerified: users.emailVerified,
    isActive: users.isActive,
    tokenVersion: users.tokenVersion,
    createdAt: users.createdAt,
    lastLoginAt: users.lastLoginAt,
  }).from(users).orderBy(users.createdAt);

  const assignments = await db.select({
    userId: userTeamAssignments.userId,
    teamId: userTeamAssignments.teamId,
  }).from(userTeamAssignments);

  const teamMap: Record<string, string[]> = {};
  for (const a of assignments) {
    if (!teamMap[a.userId]) teamMap[a.userId] = [];
    teamMap[a.userId].push(a.teamId);
  }

  return userRows.map((u) => ({ ...u, teamIds: teamMap[u.id] ?? [] })) as (UserRow & { teamIds: string[] })[];
}

export async function forceAllPasswordResets(): Promise<void> {
  // Increment every user's token version in one query — all existing JWTs are immediately invalid
  await db.update(users).set({ tokenVersion: sql`${users.tokenVersion} + 1` });
}
