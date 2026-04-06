import express from "express";
import authRoutes from "./routes/auth";
import launchRoutes from "./routes/launches";
import whitelistRoutes from "./routes/whitelist";
import referralRoutes from "./routes/referrals";
import purchaseRoutes from "./routes/purchases";
import vestingRoutes from "./routes/vesting";

const app = express();
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/auth", authRoutes);

app.use("/api/launches", launchRoutes);

app.use("/api/launches", whitelistRoutes);

app.use("/api/launches", referralRoutes);

app.use("/api/launches", purchaseRoutes);

app.use("/api/launches", vestingRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "not found" });
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
