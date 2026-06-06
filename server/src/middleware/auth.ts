import { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { verifyAccessToken, JwtPayload } from '../services/AuthService';
import { db, users, userTeamAssignments } from '../db';

export type UserRole = 'admin' | 'board' | 'head_coach' | 'assistant_coach';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: UserRole;
        tokenVersion: number;
        teamIds?: string[];
      };
    }
  }
}

/** Verify JWT, check token_version, attach req.user. */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or malformed Authorization header' });
    }

    const token = authHeader.slice(7);
    let payload: JwtPayload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Check token_version against DB to support forced resets
    const [user] = await db.select({
      id: users.id,
      role: users.role,
      tokenVersion: users.tokenVersion,
      isActive: users.isActive,
    }).from(users).where(eq(users.id, payload.sub)).limit(1);

    if (!user) return res.status(401).json({ error: 'User not found' });
    if (!user.isActive) return res.status(403).json({ error: 'Account deactivated' });
    if (user.tokenVersion !== payload.tokenVersion) {
      return res.status(401).json({ error: 'Session invalidated. Please log in again.' });
    }

    req.user = { id: user.id, role: user.role as UserRole, tokenVersion: user.tokenVersion };
    next();
  } catch (err) {
    next(err);
  }
}

/** Restrict to specific roles. Use after authenticate(). */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * Inject team scope for head_coach and assistant_coach.
 * Adds req.user.teamIds for use in service-layer queries.
 * admin and board get teamIds = null (meaning all teams).
 */
export async function injectTeamScope(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) return next();
    const role = req.user.role;

    if (role === 'admin' || role === 'board') {
      req.user.teamIds = undefined; // undefined = all teams
      return next();
    }

    const assignments = await db
      .select({ teamId: userTeamAssignments.teamId })
      .from(userTeamAssignments)
      .where(eq(userTeamAssignments.userId, req.user.id));

    req.user.teamIds = assignments.map((a) => a.teamId);
    next();
  } catch (err) {
    next(err);
  }
}

/** Helper: is the current user scoped to a specific team? */
export function canAccessTeam(req: Request, teamId: string): boolean {
  if (!req.user) return false;
  if (req.user.role === 'admin' || req.user.role === 'board') return true;
  return req.user.teamIds?.includes(teamId) ?? false;
}
