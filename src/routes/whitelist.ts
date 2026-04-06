import { Router, Response } from "express";
import prisma from "../lib/prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();

router.post("/:id/whitelist", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const launch = await prisma.launch.findUnique({ where: { id: req.params.id } });
    if (!launch) return res.status(404).json({ error: "launch not found" });
    if (launch.creatorId !== req.userId) return res.status(403).json({ error: "Forbidden" });

    const { addresses } = req.body;
    if (!addresses || !Array.isArray(addresses)) {
      return res.status(400).json({ error: "addresses must be an array" });
    }

    let added = 0;
    for (const address of addresses) {
      try {
        await prisma.whitelistEntry.create({
          data: { launchId: req.params.id, address },
        });
        added++;
      } catch {
      }
    }

    const total = await prisma.whitelistEntry.count({ where: { launchId: req.params.id } });
    return res.status(200).json({ added, total });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/whitelist", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const launch = await prisma.launch.findUnique({ where: { id: req.params.id } });
    if (!launch) return res.status(404).json({ error: "launch not found" });
    if (launch.creatorId !== req.userId) return res.status(403).json({ error: "Forbidden" });

    const entries = await prisma.whitelistEntry.findMany({ where: { launchId: req.params.id } });
    const addresses = entries.map((e) => e.address);
    return res.status(200).json({ addresses, total: addresses.length });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id/whitelist/:address", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const launch = await prisma.launch.findUnique({ where: { id: req.params.id } });
    if (!launch) return res.status(404).json({ error: "launch not found" });
    if (launch.creatorId !== req.userId) return res.status(403).json({ error: "Forbidden" });

    const entry = await prisma.whitelistEntry.findUnique({
      where: {
        launchId_address: {
          launchId: req.params.id,
          address: req.params.address,
        },
      },
    });

    if (!entry) return res.status(404).json({ error: "Address not found" });

    await prisma.whitelistEntry.delete({ where: { id: entry.id } });
    return res.status(200).json({ removed: true });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
