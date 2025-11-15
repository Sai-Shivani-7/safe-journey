import express from "express";
import History from "../models/History.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Save history
router.post("/add", authMiddleware, async (req, res) => {
  const { source, destination } = req.body;

  const entry = new History({
    userId: req.user.userId,
    source,
    destination,
  });

  await entry.save();
  res.json({ message: "History saved" });
});

// Get history
router.get("/list", authMiddleware, async (req, res) => {
  const data = await History.find({ userId: req.user.userId });
  res.json(data);
});

export default router;
