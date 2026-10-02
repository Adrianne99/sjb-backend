// Creates ONE shared Prisma client for the whole app.
// Prisma 7 talks to MySQL/MariaDB through a "driver adapter".
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient, Prisma } from "../generated/prisma/client";
import { env } from "./env";

/**
 * Turns "mysql://user:pass@host:3306/db" into the adapter's settings object.
 * Hosted databases usually require TLS: add "?sslaccept=strict" to the URL
 * (the same option the Prisma CLI understands for migrations).
 */
function parseDatabaseUrl(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const sslaccept = url.searchParams.get("sslaccept");
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    connectionLimit: 10,
    ...(sslaccept ? { ssl: { rejectUnauthorized: sslaccept === "strict" } } : {}),
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
