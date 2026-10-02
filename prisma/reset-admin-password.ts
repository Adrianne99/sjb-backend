// =============================================================================
// Emergency reset for a staff/admin password — use it when nobody can log in
// (e.g. the admin reset their own password and lost the temporary one, or the
// account is locked after too many failed logins).
//
// Development (puts back the SEED_ADMIN_PASSWORD from backend/.env):
//   npm run reset-admin-password
//
// Any account / production (sets a TEMPORARY password that must be changed at
// the next login):
//   RESET_USERNAME=jdoe NEW_PASSWORD='a-strong-temporary-password' npm run reset-admin-password
//   (on Render: run it in the service's Shell tab)
//
// It also unlocks the account, signs it out everywhere and writes an audit log entry.
// =============================================================================
import "dotenv/config";
import { prisma } from "../src/config/database";
import { checkPasswordStrength, hashPassword } from "../src/utils/password";

async function main() {
  const username = (process.env.RESET_USERNAME || process.env.SEED_ADMIN_USERNAME || "admin").trim().toLowerCase();
  const explicit = process.env.NEW_PASSWORD?.trim();
  const isProduction = process.env.NODE_ENV === "production";

  if (!explicit && isProduction) {
    console.error("❌ In production, set NEW_PASSWORD (a temporary password the user must change at login).");
    process.exit(1);
  }
  const password = explicit || process.env.SEED_ADMIN_PASSWORD?.trim();
  if (!password) {
    console.error("❌ Set NEW_PASSWORD, or SEED_ADMIN_PASSWORD in backend/.env.");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { username }, include: { role: true } });
  if (!user) {
    console.error(`❌ No account with the username "${username}".`);
    process.exit(1);
  }
  if (user.role.name === "STUDENT") {
    console.error("❌ This command is for staff and administrator accounts. Reset student passwords from the student's record.");
    process.exit(1);
  }

  // New passwords must be strong. (The .env password is your own development login, the same one the seed uses.)
  const weakness = explicit ? checkPasswordStrength(password, { username }) : null;
  if (weakness) {
    console.error(`❌ ${weakness}`);
    process.exit(1);
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(password),
        // A password typed on the command line is temporary; the .env password is the normal dev login.
        mustChangePassword: Boolean(explicit),
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
        isActive: true,
      },
    }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.auditLog.create({
      data: {
        userId: null,
        action: "PASSWORD_RESET",
        entityType: "user",
        entityId: String(user.id),
        description: `Password of ${username} reset and account unlocked from the command line`,
      },
    }),
  ]);

  console.log(
    explicit
      ? `✅ "${username}" can log in with the new temporary password and will be asked to change it.`
      : `✅ "${username}" can log in again with SEED_ADMIN_PASSWORD from backend/.env.`,
  );
}

main()
  .catch((error) => {
    console.error("❌ Failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
