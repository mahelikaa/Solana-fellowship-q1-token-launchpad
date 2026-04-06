import { Router, Response } from "express";
import prisma from "../lib/prisma";

const router = Router();

router.get("/:id/vesting", async (req, res: Response) => {
  try {
    const walletAddress = req.query.walletAddress as string;
    if (!walletAddress) {
      return res.status(400).json({ error: "missing walletAddress" });
    }

    const launch = await prisma.launch.findUnique({
      where: { id: req.params.id },
      include: { vesting: true },
    });
    if (!launch) {
      return res.status(404).json({ error: "launch not found" });
    }

    const purchasesAgg = await prisma.purchase.aggregate({
      where: { launchId: launch.id, walletAddress },
      _sum: { amount: true },
    });
    const totalPurchased = purchasesAgg._sum.amount || 0;

    if (totalPurchased === 0) {
      return res.status(200).json({
        totalPurchased: 0,
        tgeAmount: 0,
        cliffEndsAt: null,
        vestedAmount: 0,
        lockedAmount: 0,
        claimableAmount: 0,
      });
    }

    if (!launch.vesting) {
      return res.status(200).json({
        totalPurchased,
        tgeAmount: totalPurchased,
        cliffEndsAt: null,
        vestedAmount: totalPurchased,
        lockedAmount: 0,
        claimableAmount: totalPurchased,
      });
    }

    const { cliffDays, vestingDays, tgePercent } = launch.vesting;
    const tgeAmount = Math.floor(totalPurchased * tgePercent / 100);
    const lockedTotal = totalPurchased - tgeAmount;

    const launchEnd = new Date(launch.endsAt);
    const cliffEndsAt = new Date(launchEnd.getTime() + cliffDays * 24 * 60 * 60 * 1000);
    const vestingEndsAt = new Date(cliffEndsAt.getTime() + vestingDays * 24 * 60 * 60 * 1000);

    const now = new Date();

    let vestedAmount = 0;
    let lockedAmount = lockedTotal;
    let claimableAmount = tgeAmount;

    if (now >= vestingEndsAt) {
      vestedAmount = lockedTotal;
      lockedAmount = 0;
      claimableAmount = totalPurchased;
    } else if (now >= cliffEndsAt) {
      const elapsed = now.getTime() - cliffEndsAt.getTime();
      const totalVestingMs = vestingDays * 24 * 60 * 60 * 1000;
      const vestingFraction = Math.min(elapsed / totalVestingMs, 1);
      vestedAmount = Math.floor(lockedTotal * vestingFraction);
      lockedAmount = lockedTotal - vestedAmount;
      claimableAmount = tgeAmount + vestedAmount;
    }

    return res.status(200).json({
      totalPurchased,
      tgeAmount,
      cliffEndsAt: cliffEndsAt.toISOString(),
      vestedAmount,
      lockedAmount,
      claimableAmount,
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
