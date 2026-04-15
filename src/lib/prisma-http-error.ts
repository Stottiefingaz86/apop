import { Prisma } from "@prisma/client";

/**
 * Map Prisma / driver errors to a safe JSON error for API routes.
 */
export function prismaErrorToHttpResponse(err: unknown): { status: number; message: string } | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P1001") {
      return {
        status: 503,
        message:
          "Cannot reach the database. With Docker: run `npm run db:up`, set DATABASE_URL to postgresql://apop:apop@localhost:5432/apop?schema=public (and matching DIRECT_URL), restart `npm run dev`.",
      };
    }
    if (err.code === "P2021" || err.code === "P2010") {
      return {
        status: 503,
        message:
          "Database schema may be out of date. Run `npx prisma db push` (or `prisma migrate deploy`) against the same DATABASE_URL this app uses.",
      };
    }
  }

  const msg = err instanceof Error ? err.message : String(err);
  if (/P1001|Can't reach database server|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(msg)) {
    return {
      status: 503,
      message:
        "Cannot reach the database. Check DATABASE_URL and network access, then restart the dev server.",
    };
  }
  if (/column .* does not exist|relation .* does not exist|Unknown column/i.test(msg)) {
    return {
      status: 503,
      message:
        "Database schema is missing columns or tables. Run `npx prisma db push` against your DATABASE_URL.",
    };
  }

  return null;
}
