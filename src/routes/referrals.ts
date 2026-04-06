import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();

router.post("/:id/referrals", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const launch = await prisma.launch.findUnique({ where: { id: req.params.id } });
    if (!launch) return res.status(404).json({ error: "launch not found" });
    if (launch.creatorId !== req.userId) return res.status(403).json({ error: "Forbidden" });

    const { code, discountPercent, maxUses } = req.body;
    if (!code || discountPercent === undefined || maxUses === undefined) {
      return res.status(400).json({ error: "missing fields" });
    }

    const nDiscount = Number(discountPercent);
    const nMaxUses = Number(maxUses);

    if (isNaN(nDiscount) || isNaN(nMaxUses) || nDiscount < 0 || nDiscount > 100 || nMaxUses <= 0) {
      return res.status(400).json({ error: "Invalid referral parameters" });
    }

    const existing = await prisma.referralCode.findUnique({
      where: { launchId_code: { launchId: req.params.id, code } },
    });
    if (existing) {
      return res.status(409).json({ error: "duplicate code for this launch" });
    }

    const referral = await prisma.referralCode.create({
      data: {
        launchId: req.params.id,
        code,
        discountPercent: nDiscount,
        maxUses: nMaxUses,
      },
    });

    return res.status(201).json({
      id: referral.id,
      code: referral.code,
      discountPercent: referral.discountPercent,
      maxUses: referral.maxUses,
      usedCount: 0,
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/referrals", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const launch = await prisma.launch.findUnique({ where: { id: req.params.id } });
    if (!launch) return res.status(404).json({ error: "launch not found" });
    if (launch.creatorId !== req.userId) return res.status(403).json({ error: "Forbidden" });

    const referrals = await prisma.referralCode.findMany({
      where: { launchId: req.params.id },
    });

    return res.status(200).json({ referrals });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
