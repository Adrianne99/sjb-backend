// Creates ONE shared Prisma client for the whole app.
// Prisma 7 talks to MySQL/MariaDB through a "driver adapter".
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient, Prisma } from "../generated/prisma/client";
import { env } from "./env";

/**
 * Turns "mysql://user:pass@host:3306/db" into the adapter's settings object.
 * Hosted databases usually require TLS (encryption). Add to the end of the URL:
 *   ?sslaccept=strict                encrypted + the server certificate is checked
 *   ?sslaccept=accept_invalid_certs  encrypted, certificate not checked (needed for
 *                                    providers with their own certificate, e.g. Aiven)
 * These are the same options the Prisma CLI understands for migrations.
 */
function parseDatabaseUrl(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const sslaccept = url.searchParams.get("sslaccept");
  // Aiven-style "?ssl-mode=REQUIRED" also turns encryption on.
  const sslRequired = (url.searchParams.get("ssl-mode") ?? url.searchParams.get("sslmode") ?? "").toUpperCase() === "REQUIRED";
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    connectionLimit: 10,
    // The driver gives up after 1 second by default — too short for an online
    // database (encryption + distance). Allow 10 seconds to connect.
    connectTimeout: 10_000,
    ...(sslaccept ? { ssl: { rejectUnauthorized: sslaccept === "strict" } } : sslRequired ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

const adapter = new PrismaMariaDb(parseDatabaseUrl(env.DATABASE_URL));

export const prisma = new PrismaClient({
  adapter,
  log: env.isProduction ? ["error"] : ["warn", "error"],
});

/**
 * Either the main client or a transaction client.
 * Repository functions accept this so they can run inside `prisma.$transaction`.
 */
export type DbClient = PrismaClient | Prisma.TransactionClient;
