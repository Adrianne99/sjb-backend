// =============================================================================
// Creates the FIRST administrator account — safe to use in production.
//
//   ADMIN_USERNAME=jdoe ADMIN_EMAIL=jdoe@school.edu.ph ADMIN_FIRST_NAME=Juana \
//   ADMIN_LAST_NAME=Doe ADMIN_PASSWORD='a-strong-temporary-password' npm run create-admin
//
// On Render: open the service's Shell tab and run the command above.
// The account must change its password at first login. Running it again with
// an existing username does nothing.
// =============================================================================
import "dotenv/config";
import { prisma } from "../src/config/database";
import { checkPasswordStrength, hashPassword } from "../src/utils/password";
import { DEFAULT_GRADING_CONFIG, DEFAULT_STUDENT_EDITABLE_FIELDS } from "../src/validators/settings.validators";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`❌ Set ${name}.`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const username = required("ADMIN_USERNAME").toLowerCase();
  const email = required("ADMIN_EMAIL").toLowerCase();
  const password = required("ADMIN_PASSWORD");
  const firstName = process.env.ADMIN_FIRST_NAME?.trim() || "System";
  const lastName = process.env.ADMIN_LAST_NAME?.trim() || "Administrator";

  const weakness = checkPasswordStrength(password, { username });
  if (weakness) {
    console.error(`❌ ${weakness}`);
    process.exit(1);
  }

  if (await prisma.user.findUnique({ where: { username } })) {
    console.log(`ℹ️  User "${username}" already exists — nothing changed.`);
    return;
  }

  // Default settings (only if they were never saved).
  for (const [key, value] of [
    ["grading", DEFAULT_GRADING_CONFIG],
    ["student_editable_fields", DEFAULT_STUDENT_EDITABLE_FIELDS],
  ] as const) {
    await prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: {} });
  }

  const role = await prisma.role.findUniqueOrThrow({ where: { name: "ADMIN" } });
  const user = await prisma.user.create({
    data: {
      username,
      email,
      passwordHash: await hashPassword(password),
      roleId: role.id,
      mustChangePassword: true,
      staffProfile: { create: { firstName, lastName, position: "Administrator" } },
    },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "ACCOUNT_CREATED", entityType: "user", entityId: String(user.id), description: `Initial administrator ${username} created from the command line` },
  });
  console.log(`✅ Administrator "${username}" created. They must change the password at first login.`);
}

main()
  .catch((error) => {
    console.error("❌ Failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
