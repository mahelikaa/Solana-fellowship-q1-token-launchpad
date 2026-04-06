import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { computeStatus } from "./launches";

const router = Router();

function calculateTieredCost(
  amount: number,
  tiers: { minAmount: number; maxAmount: number; pricePerToken: number }[],
  flatPrice: number,
  totalPurchased: number
): number {
  if (!tiers || tiers.length === 0) {
    return amount * flatPrice;
  }

  const sortedTiers = [...tiers].sort((a, b) => a.minAmount - b.minAmount);

  let remainingToBuy = amount;
  let currentTotalBought = totalPurchased;
  let totalCost = 0;

  for (const tier of sortedTiers) {
    if (remainingToBuy <= 0) break;

    if (currentTotalBought >= tier.maxAmount) continue;

    const tierStart = Math.max(currentTotalBought, tier.minAmount);
    
    
    const availableCapacityInTier = tier.maxAmount - tierStart;
    if (availableCapacityInTier <= 0) continue;

    const fillAmount = Math.min(remainingToBuy, availableCapacityInTier);
    totalCost += fillAmount * tier.pricePerToken;
    
    remainingToBuy -= fillAmount;
    currentTotalBought += fillAmount;
  }

  if (remainingToBuy > 0) {
    totalCost += remainingToBuy * flatPrice;
  }

  return totalCost;
}

router.post("/:id/purchase", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { walletAddress, amount, txSignature, referralCode } = req.body;

    if (!walletAddress || amount === undefined || !txSignature) {
      return res.status(400).json({ error: "missing fields" });
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "Amount must be greater than 0" });
    }

    const launch = await prisma.launch.findUnique({
      where: { id: req.params.id },
      include: { tiers: true, vesting: true },
    });
    if (!launch) {
      return res.status(404).json({ error: "launch not found" });
    }

    const totalPurchasedAgg = await prisma.purchase.aggregate({
      where: { launchId: launch.id },
      _sum: { amount: true },
    });
    const totalPurchased = totalPurchasedAgg._sum.amount || 0;
    const status = computeStatus(launch, totalPurchased);

    if (status !== "ACTIVE") {
      return res.status(400).json({ error: "launch not ACTIVE" });
    }

    if (totalPurchased + numericAmount > launch.totalSupply) {
      return res.status(400).json({ error: "exceeds totalSupply" });
    }

    const userPurchasesAgg = await prisma.purchase.aggregate({
      where: { launchId: launch.id, userId: req.userId! },
      _sum: { amount: true },
    });
    const userTotal = userPurchasesAgg._sum.amount || 0;
    if (userTotal + numericAmount > launch.maxPerWallet) {
      return res.status(400).json({ error: "exceeds maxPerWallet per user" });
    }

    const whitelistCount = await prisma.whitelistEntry.count({ where: { launchId: launch.id } });
    if (whitelistCount > 0) {
      const isWhitelisted = await prisma.whitelistEntry.findUnique({
        where: { launchId_address: { launchId: launch.id, address: walletAddress } },
      });
      if (!isWhitelisted) {
        return res.status(400).json({ error: "not whitelisted" });
      }
    }

    const existingTx = await prisma.purchase.findUnique({ where: { txSignature } });
    if (existingTx) {
      return res.status(400).json({ error: "duplicate txSignature" });
    }

    let totalCost = calculateTieredCost(numericAmount, launch.tiers, launch.pricePerToken, totalPurchased);

    let referralCodeId: string | null = null;
    if (referralCode) {
      const refCode = await prisma.referralCode.findUnique({
        where: { launchId_code: { launchId: launch.id, code: referralCode } },
      });
      if (!refCode) {
        return res.status(400).json({ error: "invalid referral" });
      }
      if (refCode.usedCount >= refCode.maxUses) {
        return res.status(400).json({ error: "invalid referral" });
      }
      totalCost = totalCost * (1 - refCode.discountPercent / 100);
      referralCodeId = refCode.id;

      await prisma.referralCode.update({
        where: { id: refCode.id },
        data: { usedCount: { increment: 1 } },
      });
    }

    const purchase = await prisma.purchase.create({
      data: {
        launchId: launch.id,
        userId: req.userId!,
        walletAddress,
        amount: numericAmount,
        totalCost,
        txSignature,
        referralCodeId,
      },
    });

    return res.status(201).json(purchase);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/purchases", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const launch = await prisma.launch.findUnique({ where: { id: req.params.id } });
    if (!launch) {
      return res.status(404).json({ error: "launch not found" });
    }

    const where = launch.creatorId === req.userId
      ? { launchId: req.params.id }
      : { launchId: req.params.id, userId: req.userId! };

    const purchases = await prisma.purchase.findMany({ where });

    return res.status(200).json({ purchases, total: purchases.length });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
