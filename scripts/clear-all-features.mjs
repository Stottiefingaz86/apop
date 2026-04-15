/**
 * Deletes every Feature row (runs, artifacts, questions, releases, etc. cascade).
 * Usage: npm run db:clear-features
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.feature.deleteMany({});
  console.log(`Deleted ${result.count} feature(s). Related rows removed via DB cascade.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
