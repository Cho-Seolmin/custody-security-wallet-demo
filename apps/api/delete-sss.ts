import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const wallets = await prisma.wallet.findMany({
    where: { walletType: "SSS" },
  });

  for (const w of wallets) {
    await prisma.withdrawalAuditLog.deleteMany({ where: { walletId: w.id } });
    await prisma.withdrawRequest.deleteMany({ where: { walletId: w.id } });
    await prisma.walletSecurityState.deleteMany({ where: { walletId: w.id } });
    await prisma.whitelist.deleteMany({ where: { walletId: w.id } });
    await prisma.walletLimit.deleteMany({ where: { walletId: w.id } });
    await prisma.wallet.delete({ where: { id: w.id } });

    console.log("deleted:", w.id);
  }
}

main().finally(() => prisma.$disconnect());