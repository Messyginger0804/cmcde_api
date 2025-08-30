let prisma = null;

function getPrisma() {
  if (prisma !== null) return prisma;
  try {
    // Lazy require so that the API still runs without @prisma/client installed
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
  } catch (err) {
    prisma = undefined; // signal unavailable
  }
  return prisma;
}

module.exports = { getPrisma };

