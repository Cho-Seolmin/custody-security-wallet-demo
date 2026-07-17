/**
 * One-time DB-only cleanup: delete Wallet rows owned by users other than
 * protected demo accounts. Never touches AWS/DFNS/signer/PolicyVault/RPC.
 *
 * Usage:
 *   npm run cleanup:wallets:dry-run --workspace apps/api
 *   npm run cleanup:wallets:execute --workspace apps/api -- --confirm=DELETE_NON_TEST_WALLETS
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import {
  PrismaClient,
  type QueueStatus,
  type WalletType,
  type WithdrawStatus,
} from '@prisma/client';

loadEnv({ path: resolve(__dirname, '../.env') });

const PROTECTED_EMAILS = ['test@test.com'] as const;
const CONFIRM_TOKEN = 'DELETE_NON_TEST_WALLETS';

/** Real WithdrawStatus values that mean work is still active. */
const IN_FLIGHT_WITHDRAW_STATUSES: WithdrawStatus[] = [
  'PENDING',
  'APPROVED',
  'QUEUED',
  'PROCESSING',
];

/** Real QueueStatus values that mean a worker may still act. */
const IN_FLIGHT_QUEUE_STATUSES: QueueStatus[] = [
  'PENDING',
  'RESERVED',
  'RUNNING',
  'RETRY_WAIT',
];

type Mode = 'dry-run' | 'execute';

type TargetWallet = {
  id: string;
  walletType: WalletType;
  address: string;
  userId: string;
  userEmail: string;
};

function parseArgs(argv: string[]): { mode: Mode; confirm?: string } {
  const hasDryRun = argv.includes('--dry-run');
  const hasExecute = argv.includes('--execute');
  const confirmArg = argv.find((a) => a.startsWith('--confirm='));
  const confirm = confirmArg?.slice('--confirm='.length);

  if (hasDryRun && hasExecute) {
    throw new Error('Pass only one of --dry-run or --execute');
  }
  if (!hasDryRun && !hasExecute) {
    throw new Error('Required: --dry-run or --execute');
  }
  return { mode: hasExecute ? 'execute' : 'dry-run', confirm };
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain || !local) return '***';
  const head = local.slice(0, 1) || '*';
  return `${head}***@${domain}`;
}

function maskAddress(address: string): string {
  if (address.length < 10) return '0x****';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function assertOwnerNotProtected(email: string, context: string): void {
  if (PROTECTED_EMAILS.includes(email as (typeof PROTECTED_EMAILS)[number])) {
    throw new Error(
      `ABORT: protected email detected during ${context}: ${maskEmail(email)}`,
    );
  }
  if (email === 'test@test.com') {
    throw new Error(`ABORT: test@test.com detected during ${context}`);
  }
}

async function collectInventory(prisma: PrismaClient) {
  const protectedUsers = await prisma.user.findMany({
    where: { email: { in: [...PROTECTED_EMAILS] } },
    select: { id: true, email: true },
  });

  const protectedWallets = await prisma.wallet.findMany({
    where: { user: { email: { in: [...PROTECTED_EMAILS] } } },
    select: { id: true, walletType: true, userId: true },
  });

  const candidateWallets = await prisma.wallet.findMany({
    where: {
      user: {
        email: { notIn: [...PROTECTED_EMAILS] },
      },
    },
    select: {
      id: true,
      walletType: true,
      address: true,
      userId: true,
      user: { select: { email: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const targets: TargetWallet[] = [];
  for (const w of candidateWallets) {
    const email = w.user?.email;
    if (!email) {
      throw new Error(
        `ABORT: wallet ${w.id} has unknown owner email — refusing cleanup`,
      );
    }
    assertOwnerNotProtected(email, 'candidate selection');
    targets.push({
      id: w.id,
      walletType: w.walletType,
      address: w.address,
      userId: w.userId,
      userEmail: email,
    });
  }

  // Positive verification pass: every target must re-check ownership.
  for (const t of targets) {
    if (!t.userEmail) {
      throw new Error(`ABORT: target wallet ${t.id} missing owner email`);
    }
    assertOwnerNotProtected(t.userEmail, 'positive ownership verification');
    if (t.userEmail === 'test@test.com') {
      throw new Error(`ABORT: target wallet ${t.id} resolves to test@test.com`);
    }
  }

  const targetIds = targets.map((t) => t.id);
  const protectedWalletCountBefore = protectedWallets.length;

  const byType = targets.reduce<Record<string, number>>((acc, t) => {
    acc[t.walletType] = (acc[t.walletType] ?? 0) + 1;
    return acc;
  }, {});

  const targetUserIds = [...new Set(targets.map((t) => t.userId))];

  const [
    withdrawRequestCount,
    auditLogCount,
    adminApprovalCount,
    queueCount,
    limitCount,
    whitelistCount,
  ] =
    targetIds.length === 0
      ? [0, 0, 0, 0, 0, 0]
      : await Promise.all([
          prisma.withdrawRequest.count({
            where: { walletId: { in: targetIds } },
          }),
          prisma.withdrawalAuditLog.count({
            where: { walletId: { in: targetIds } },
          }),
          prisma.adminApproval.count({
            where: { withdrawRequest: { walletId: { in: targetIds } } },
          }),
          prisma.withdrawalQueue.count({
            where: { withdrawRequest: { walletId: { in: targetIds } } },
          }),
          prisma.walletLimit.count({
            where: { walletId: { in: targetIds } },
          }),
          prisma.whitelist.count({
            where: { walletId: { in: targetIds } },
          }),
        ]);

  const prefsToNull =
    targetIds.length === 0
      ? []
      : await prisma.userPreference.findMany({
          where: {
            defaultWalletId: { in: targetIds },
            user: { email: { notIn: [...PROTECTED_EMAILS] } },
          },
          select: {
            id: true,
            userId: true,
            defaultWalletId: true,
            user: { select: { email: true } },
          },
        });

  for (const pref of prefsToNull) {
    const email = pref.user?.email;
    if (!email) {
      throw new Error(
        `ABORT: preference ${pref.id} has unknown owner — refusing cleanup`,
      );
    }
    assertOwnerNotProtected(email, 'preference nulling selection');
  }

  const inFlightWithdraws =
    targetIds.length === 0
      ? []
      : await prisma.withdrawRequest.findMany({
          where: {
            walletId: { in: targetIds },
            status: { in: IN_FLIGHT_WITHDRAW_STATUSES },
          },
          select: {
            id: true,
            walletId: true,
            status: true,
          },
        });

  const inFlightQueues =
    targetIds.length === 0
      ? []
      : await prisma.withdrawalQueue.findMany({
          where: {
            status: { in: IN_FLIGHT_QUEUE_STATUSES },
            withdrawRequest: { walletId: { in: targetIds } },
          },
          select: {
            id: true,
            status: true,
            withdrawRequestId: true,
            withdrawRequest: { select: { walletId: true, status: true } },
          },
        });

  const uniqueOwnerEmails = [...new Set(targets.map((t) => t.userEmail))];

  return {
    protectedUsers,
    protectedWallets,
    protectedWalletCountBefore,
    targets,
    targetIds,
    targetUserIds,
    byType,
    withdrawRequestCount,
    auditLogCount,
    adminApprovalCount,
    queueCount,
    limitCount,
    whitelistCount,
    prefsToNull,
    inFlightWithdraws,
    inFlightQueues,
    uniqueOwnerEmails,
  };
}

function printDryRunReport(
  inventory: Awaited<ReturnType<typeof collectInventory>>,
): 'SAFE TO EXECUTE' | 'BLOCKED: ACTIVE REQUESTS FOUND' {
  const {
    protectedUsers,
    protectedWallets,
    targets,
    byType,
    withdrawRequestCount,
    auditLogCount,
    adminApprovalCount,
    queueCount,
    limitCount,
    whitelistCount,
    prefsToNull,
    inFlightWithdraws,
    inFlightQueues,
    uniqueOwnerEmails,
  } = inventory;

  console.log('=== cleanup-non-test-wallets DRY RUN ===');
  console.log(`Protected emails allowlist: ${PROTECTED_EMAILS.join(', ')}`);
  console.log(`Protected users found: ${protectedUsers.length}`);
  console.log(`Protected wallets found: ${protectedWallets.length}`);
  console.log(`Target non-test users: ${uniqueOwnerEmails.length}`);
  console.log(`Target Wallet rows: ${targets.length}`);
  console.log('Target Wallet counts by type:');
  for (const [type, count] of Object.entries(byType).sort()) {
    console.log(`  - ${type}: ${count}`);
  }
  if (Object.keys(byType).length === 0) {
    console.log('  (none)');
  }

  console.log(`Related WithdrawRequest rows: ${withdrawRequestCount}`);
  console.log(`Related WithdrawalAuditLog rows: ${auditLogCount}`);
  console.log(`Related AdminApproval rows: ${adminApprovalCount}`);
  console.log(`Related WithdrawalQueue rows: ${queueCount}`);
  console.log(`Related WalletLimit rows: ${limitCount}`);
  console.log(`Related Whitelist rows: ${whitelistCount}`);
  console.log(
    `UserPreference rows requiring defaultWalletId nulling: ${prefsToNull.length}`,
  );

  console.log(
    `In-flight WithdrawRequest count: ${inFlightWithdraws.length} (statuses: ${IN_FLIGHT_WITHDRAW_STATUSES.join(', ')})`,
  );
  for (const wr of inFlightWithdraws) {
    console.log(
      `  - requestId=${wr.id} walletId=${wr.walletId} status=${wr.status}`,
    );
  }

  console.log(
    `In-flight WithdrawalQueue count: ${inFlightQueues.length} (statuses: ${IN_FLIGHT_QUEUE_STATUSES.join(', ')})`,
  );
  for (const q of inFlightQueues) {
    console.log(
      `  - queueId=${q.id} requestId=${q.withdrawRequestId} queueStatus=${q.status} withdrawStatus=${q.withdrawRequest.status} walletId=${q.withdrawRequest.walletId}`,
    );
  }

  console.log('Masked owner emails:');
  for (const email of uniqueOwnerEmails) {
    console.log(`  - ${maskEmail(email)}`);
  }
  if (uniqueOwnerEmails.length === 0) {
    console.log('  (none)');
  }

  console.log('Target wallets (id / type / masked address / masked owner):');
  for (const t of targets) {
    console.log(
      `  - ${t.id} | ${t.walletType} | ${maskAddress(t.address)} | ${maskEmail(t.userEmail)}`,
    );
  }
  if (targets.length === 0) {
    console.log('  (none)');
  }

  const blocked =
    inFlightWithdraws.length > 0 || inFlightQueues.length > 0;

  if (blocked) {
    const walletIds = [
      ...new Set([
        ...inFlightWithdraws.map((w) => w.walletId),
        ...inFlightQueues.map((q) => q.withdrawRequest.walletId),
      ]),
    ];
    console.log('Affected wallet IDs with active work:');
    for (const id of walletIds) {
      console.log(`  - ${id}`);
    }
    console.log('BLOCKED: ACTIVE REQUESTS FOUND');
    return 'BLOCKED: ACTIVE REQUESTS FOUND';
  }

  console.log('SAFE TO EXECUTE');
  return 'SAFE TO EXECUTE';
}

async function executeCleanup(
  prisma: PrismaClient,
  inventory: Awaited<ReturnType<typeof collectInventory>>,
): Promise<void> {
  const { targets, targetIds, prefsToNull, protectedWalletCountBefore } =
    inventory;

  if (targetIds.length === 0) {
    console.log('Nothing to delete. Exiting successfully.');
    return;
  }

  // Re-validate ownership and in-flight state immediately before write.
  const reloaded = await prisma.wallet.findMany({
    where: { id: { in: targetIds } },
    select: {
      id: true,
      user: { select: { email: true } },
    },
  });

  if (reloaded.length !== targetIds.length) {
    throw new Error(
      `ABORT: target set changed between dry-run and execute (expected ${targetIds.length}, found ${reloaded.length})`,
    );
  }

  for (const w of reloaded) {
    const email = w.user?.email;
    if (!email) {
      throw new Error(`ABORT: wallet ${w.id} lost owner email before delete`);
    }
    assertOwnerNotProtected(email, 'pre-delete re-fetch');
  }

  const stillInFlight = await prisma.withdrawRequest.findMany({
    where: {
      walletId: { in: targetIds },
      status: { in: IN_FLIGHT_WITHDRAW_STATUSES },
    },
    select: { id: true, walletId: true, status: true },
  });
  const stillInFlightQueues = await prisma.withdrawalQueue.findMany({
    where: {
      status: { in: IN_FLIGHT_QUEUE_STATUSES },
      withdrawRequest: { walletId: { in: targetIds } },
    },
    select: { id: true, status: true, withdrawRequestId: true },
  });

  if (stillInFlight.length > 0 || stillInFlightQueues.length > 0) {
    console.error('ABORT: in-flight requests appeared before delete');
    for (const wr of stillInFlight) {
      console.error(
        `  requestId=${wr.id} walletId=${wr.walletId} status=${wr.status}`,
      );
    }
    for (const q of stillInFlightQueues) {
      console.error(
        `  queueId=${q.id} requestId=${q.withdrawRequestId} status=${q.status}`,
      );
    }
    throw new Error('BLOCKED: ACTIVE REQUESTS FOUND');
  }

  const prefIds = prefsToNull.map((p) => p.id);

  await prisma.$transaction(async (tx) => {
    if (prefIds.length > 0) {
      const prefs = await tx.userPreference.findMany({
        where: { id: { in: prefIds } },
        select: {
          id: true,
          defaultWalletId: true,
          user: { select: { email: true } },
        },
      });

      for (const pref of prefs) {
        const email = pref.user?.email;
        if (!email) {
          throw new Error(
            `ABORT: preference ${pref.id} missing owner inside transaction`,
          );
        }
        assertOwnerNotProtected(email, 'transaction preference update');
        if (
          !pref.defaultWalletId ||
          !targetIds.includes(pref.defaultWalletId)
        ) {
          throw new Error(
            `ABORT: preference ${pref.id} defaultWalletId no longer a validated target`,
          );
        }
      }

      await tx.userPreference.updateMany({
        where: {
          id: { in: prefIds },
          user: { email: { notIn: [...PROTECTED_EMAILS] } },
          defaultWalletId: { in: targetIds },
        },
        data: { defaultWalletId: null },
      });
    }

    const walletsInTx = await tx.wallet.findMany({
      where: { id: { in: targetIds } },
      select: {
        id: true,
        user: { select: { email: true } },
      },
    });

    if (walletsInTx.length !== targetIds.length) {
      throw new Error(
        `ABORT: wallet count mismatch inside transaction (expected ${targetIds.length}, found ${walletsInTx.length})`,
      );
    }

    for (const w of walletsInTx) {
      const email = w.user?.email;
      if (!email) {
        throw new Error(
          `ABORT: wallet ${w.id} missing owner inside transaction`,
        );
      }
      assertOwnerNotProtected(email, 'transaction wallet delete');
      if (w.user.email === 'test@test.com') {
        throw new Error(
          `ABORT: wallet ${w.id} owner is test@test.com inside transaction`,
        );
      }
    }

    const inFlightInTx = await tx.withdrawRequest.count({
      where: {
        walletId: { in: targetIds },
        status: { in: IN_FLIGHT_WITHDRAW_STATUSES },
      },
    });
    const inFlightQueueInTx = await tx.withdrawalQueue.count({
      where: {
        status: { in: IN_FLIGHT_QUEUE_STATUSES },
        withdrawRequest: { walletId: { in: targetIds } },
      },
    });
    if (inFlightInTx > 0 || inFlightQueueInTx > 0) {
      throw new Error('ABORT: in-flight work detected inside transaction');
    }

    const deleted = await tx.wallet.deleteMany({
      where: {
        id: { in: targetIds },
        user: { email: { notIn: [...PROTECTED_EMAILS] } },
      },
    });

    if (deleted.count !== targetIds.length) {
      throw new Error(
        `ABORT: deleted count mismatch (expected ${targetIds.length}, deleted ${deleted.count})`,
      );
    }
  });

  // Post-deletion verification
  const protectedUser = await prisma.user.findUnique({
    where: { email: 'test@test.com' },
    select: { id: true, email: true },
  });
  if (!protectedUser) {
    throw new Error('POST-CHECK FAIL: test@test.com no longer exists');
  }

  const protectedWalletCountAfter = await prisma.wallet.count({
    where: { user: { email: { in: [...PROTECTED_EMAILS] } } },
  });
  if (protectedWalletCountAfter !== protectedWalletCountBefore) {
    throw new Error(
      `POST-CHECK FAIL: protected wallet count changed (${protectedWalletCountBefore} -> ${protectedWalletCountAfter})`,
    );
  }

  const remainingTargets = await prisma.wallet.count({
    where: { id: { in: targetIds } },
  });
  if (remainingTargets !== 0) {
    throw new Error(
      `POST-CHECK FAIL: ${remainingTargets} target wallets still remain`,
    );
  }

  if (prefIds.length > 0) {
    const stillPointing = await prisma.userPreference.count({
      where: {
        id: { in: prefIds },
        defaultWalletId: { not: null },
      },
    });
    if (stillPointing !== 0) {
      throw new Error(
        `POST-CHECK FAIL: ${stillPointing} preferences still have defaultWalletId`,
      );
    }
  }

  const usersStillExist = await prisma.user.count({
    where: { id: { in: targets.map((t) => t.userId) } },
  });
  if (usersStillExist !== inventory.targetUserIds.length) {
    throw new Error(
      `POST-CHECK FAIL: user accounts were deleted (expected ${inventory.targetUserIds.length}, found ${usersStillExist})`,
    );
  }

  console.log('=== EXECUTE COMPLETE ===');
  console.log(`Deleted wallets: ${targetIds.length}`);
  console.log(`Nulled preferences: ${prefIds.length}`);
  console.log(`Protected user present: ${protectedUser.email}`);
  console.log(`Protected wallet count unchanged: ${protectedWalletCountAfter}`);
}

async function main() {
  const { mode, confirm } = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    if (mode === 'execute') {
      if (confirm !== CONFIRM_TOKEN) {
        console.error(
          `Missing or invalid confirmation. Required: --confirm=${CONFIRM_TOKEN}`,
        );
        process.exitCode = 1;
        return;
      }
    }

    // Always re-run full inventory (execute never trusts a stale dry-run).
    const inventory = await collectInventory(prisma);
    const verdict = printDryRunReport(inventory);

    if (mode === 'dry-run') {
      process.exitCode = verdict === 'SAFE TO EXECUTE' ? 0 : 1;
      return;
    }

    if (verdict !== 'SAFE TO EXECUTE') {
      console.error('Execute aborted: dry-run validation blocked deletion.');
      process.exitCode = 1;
      return;
    }

    await executeCleanup(prisma, inventory);
    process.exitCode = 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
