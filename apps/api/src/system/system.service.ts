import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SignerService } from "../wallet/signer.service";

@Injectable()
export class SystemService {
  constructor(
    private prisma: PrismaService,
    private signerService: SignerService,
  ) {}

  async getHealth() {

    const queuePending = await this.prisma.withdrawalQueue.count({
      where: { status: "PENDING" },
    });

    const queueRunning = await this.prisma.withdrawalQueue.count({
      where: { status: "RUNNING" },
    });

    const queueDead = await this.prisma.withdrawalQueue.count({
      where: { status: "DEAD" },
    });

    const signerAddress = await this.signerService.getSignerAddress();
    const signerBalance = await this.signerService.getSignerBalance();

    return {
      queuePending,
      queueRunning,
      queueDead,
      workerActive: true,
      signerAddress,
      signerBalanceWei: signerBalance.toString(),
    };
  }
}