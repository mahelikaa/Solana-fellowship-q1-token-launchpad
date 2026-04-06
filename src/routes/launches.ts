import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { Launch, Purchase } from "@prisma/client";

const router = Router();

export function computeStatus(launch: Launch, totalPurchased: number): string {
  if (totalPurchased >= launch.totalSupply) return "SOLD_OUT";
  const now = new Date();
  if (now < new Date(launch.startsAt)) return "UPCOMING";
  if (now > new Date(launch.endsAt)) return "ENDED";
  return "ACTIVE";
}

export async function formatLaunch(launch: any) {
  const purchases = await prisma.purchase.aggregate({
    where: { launchId: launch.id },
    _sum: { amount: true },
  });
  const totalPurchased = purchases._sum.amount || 0;
  const status = computeStatus(launch, totalPurchased);
  return { ...launch, status };
}

router.post("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, symbol, totalSupply, pricePerToken, startsAt, endsAt, maxPerWallet, description, tiers, vesting } = req.body;

    if (!name || !symbol || totalSupply === undefined || pricePerToken === undefined || !startsAt || !endsAt || maxPerWallet === undefined || description === undefined) {
      return res.status(400).json({ error: "missing fields" });
    }

    if (totalSupply <= 0 || pricePerToken <= 0 || maxPerWallet <= 0) {
      return res.status(400).json({ error: "Numeric fields must be greater than 0" });
    }

    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: "invalid dates" });
    }

    if (startDate >= endDate) {
      return res.status(400).json({ error: "startsAt must be before endsAt" });
    }

    if (vesting && (Number(vesting.tgePercent) < 0 || Number(vesting.tgePercent) > 100)) {
      return res.status(400).json({ error: "invalid tgePercent" });
    }

    const launch = await prisma.launch.create({
      data: {
        creatorId: req.userId!,
        name,
        symbol,
        totalSupply: Number(totalSupply),
        pricePerToken: Number(pricePerToken),
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        maxPerWallet: Number(maxPerWallet),
        description: description || "",
        tiers: tiers
          ? {
              create: tiers.map((t: any) => ({
                minAmount: Number(t.minAmount),
                maxAmount: Number(t.maxAmount),
                pricePerToken: Number(t.pricePerToken),
              })),
            }
          : undefined,
        vesting: vesting
          ? {
              create: {
                cliffDays: Number(vesting.cliffDays),
                vestingDays: Number(vesting.vestingDays),
                tgePercent: Number(vesting.tgePercent),
              },
            }
          : undefined,
      },
      include: { tiers: true, vesting: true },
    });

    const formatted = await formatLaunch(launch);
    return res.status(201).json(formatted);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", async (req, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, parseInt(req.query.limit as string) || 10);
    const statusFilter = req.query.status as string | undefined;
    const skip = (page - 1) * limit;

    const allLaunches = await prisma.launch.findMany({
      include: { tiers: true, vesting: true },
    });

    const formattedLaunches = await Promise.all(allLaunches.map(formatLaunch));

    const filtered = statusFilter
      ? formattedLaunches.filter((l) => l.status === statusFilter)
      : formattedLaunches;

    const total = filtered.length;
    const launches = filtered.slice(skip, skip + limit);

    return res.status(200).json({ launches, total, page, limit });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res: Response) => {
  try {
    const launch = await prisma.launch.findUnique({
      where: { id: req.params.id },
      include: { tiers: true, vesting: true },
    });
    if (!launch) {
      return res.status(404).json({ error: "Launch not found" });
    }
    const formatted = await formatLaunch(launch);
    return res.status(200).json(formatted);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const launch = await prisma.launch.findUnique({
      where: { id: req.params.id },
    });
    if (!launch) {
      return res.status(404).json({ error: "Launch not found" });
    }
    if (launch.creatorId !== req.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { name, symbol, totalSupply, pricePerToken, startsAt, endsAt, maxPerWallet, description } = req.body;

    if (totalSupply !== undefined && Number(totalSupply) <= 0) return res.status(400).json({ error: "Numeric fields must be greater than 0" });
    if (pricePerToken !== undefined && Number(pricePerToken) <= 0) return res.status(400).json({ error: "Numeric fields must be greater than 0" });
    if (maxPerWallet !== undefined && Number(maxPerWallet) <= 0) return res.status(400).json({ error: "Numeric fields must be greater than 0" });

    let newStartsAt = launch.startsAt;
    let newEndsAt = launch.endsAt;

    if (startsAt !== undefined) {
      newStartsAt = new Date(startsAt);
      if (isNaN(newStartsAt.getTime())) return res.status(400).json({ error: "invalid dates" });
    }
    if (endsAt !== undefined) {
      newEndsAt = new Date(endsAt);
      if (isNaN(newEndsAt.getTime())) return res.status(400).json({ error: "invalid dates" });
    }

    if (newStartsAt >= newEndsAt) {
      return res.status(400).json({ error: "startsAt must be before endsAt" });
    }

    const updated = await prisma.launch.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(symbol !== undefined && { symbol }),
        ...(totalSupply !== undefined && { totalSupply: Number(totalSupply) }),
        ...(pricePerToken !== undefined && { pricePerToken: Number(pricePerToken) }),
        ...(startsAt !== undefined && { startsAt: newStartsAt }),
        ...(endsAt !== undefined && { endsAt: newEndsAt }),
        ...(maxPerWallet !== undefined && { maxPerWallet: Number(maxPerWallet) }),
        ...(description !== undefined && { description }),
      },
      include: { tiers: true, vesting: true },
    });

    const formatted = await formatLaunch(updated);
    return res.status(200).json(formatted);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
