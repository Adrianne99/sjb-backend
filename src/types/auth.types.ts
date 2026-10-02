import type { RoleName } from "../generated/prisma/client";

/** The logged-in user, as attached to every authenticated request. */
export interface AuthUser {
  id: number;
  username: string;
  email: string | null;
  role: RoleName;
  mustChangePassword: boolean;
  displayName: string;
  /** Set only for STUDENT accounts. */
  studentId: number | null;
  studentNumber: string | null;
}

export interface AuthContext {
  user: AuthUser;
  sessionId: number;
  csrfToken: string;
}

/** Who performed an action — stored in audit logs. */
export interface Actor {
  userId: number | null;
  role: RoleName | null;
  ipAddress: string | null;
}
