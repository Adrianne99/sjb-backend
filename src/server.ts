// Entry point: starts the HTTP server.
import { createApp } from "./app";
import { prisma } from "./config/database";
import { CHAT_CLEANUP_INTERVAL_MS } from "./config/constants";
import { env } from "./config/env";
import { cleanUpChatSessions } from "./services/chatbot/chat-session.service";
import { notifyLater, sendDueAnnouncementEmails } from "./services/notifications/student-notifications.service";
import { logger } from "./utils/logger";

async function main() {
  // Fail fast with a clear message if MySQL (XAMPP) is not running.
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    // Show the real reason (wrong password, certificate, timeout...), not only the generic error.
    const cause = (error as { meta?: { driverAdapterError?: { cause?: unknown } } })?.meta?.driverAdapterError?.cause;
    logger.error(
      env.isProduction
        ? "❌ Cannot connect to the database. Check DATABASE_URL (host, port, user, password, database name and the ?sslaccept=... option)."
        : "❌ Cannot connect to the database. Is MySQL running in XAMPP, and is DATABASE_URL correct?",
      cause ?? error,
    );
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`✅ SJB School Management API running on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  // Announcements with a future publish date are emailed when they go live:
  // check every 10 minutes (and once now). Each announcement is emailed once.
  const ANNOUNCEMENT_CHECK_MS = 10 * 60 * 1000;
  const checkAnnouncements = () => notifyLater("scheduled announcements", () => sendDueAnnouncementEmails());
  checkAnnouncements();
  const announcementTimer = setInterval(checkAnnouncements, ANNOUNCEMENT_CHECK_MS);
  announcementTimer.unref();

  // Delete ended SJB Assistant chat sessions (and their messages) once they are
  // older than CHAT_SESSION_RETENTION_HOURS. Active chats are never touched.
  const cleanChats = () => cleanUpChatSessions().catch((error) => logger.error("Chat session cleanup failed.", error));
  void cleanChats();
  const chatCleanupTimer = setInterval(cleanChats, CHAT_CLEANUP_INTERVAL_MS);
  chatCleanupTimer.unref();

  // Close connections cleanly when Render/your terminal stops the process.
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down...`);
    clearInterval(announcementTimer);
    clearInterval(chatCleanupTimer);
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
