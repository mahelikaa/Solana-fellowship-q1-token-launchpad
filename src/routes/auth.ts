import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-contest";

router.post("/register", async (req, res: Response) => {
  try {
    const { password, name } = req.body;
    let email = req.body.email;

    if (!email || !password || !name) {
      return res.status(400).json({ error: "missing fields" });
    }
    
    email = email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "duplicate email" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name },
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET);

    return res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/login", async (req, res: Response) => {
  try {
    const { password } = req.body;
    let email = req.body.email;

    if (!email || !password) {
      return res.status(400).json({ error: "missing fields" });
    }

    email = email.toLowerCase();

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "invalid credentials or non-existent user" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "invalid credentials or non-existent user" });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET);

    return res.status(200).json({
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
