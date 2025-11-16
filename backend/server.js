// server.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoutes.js";
import historyRoutes from "./routes/historyRoutes.js";

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Debug logs to check env variables
console.log("MONGO_URI?", !!process.env.MONGO_URI);
console.log("JWT_SECRET?", !!process.env.JWT_SECRET);

// Test route to make sure server is running
app.get("/", (req, res) => {
  res.send("Safe Journey API is running 🚀");
});

const start = async () => {
  try {
    mongoose.set("strictQuery", false);

    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB Connected ✔️");

    // Mount routes
    app.use("/auth", authRoutes);
    app.use("/history", historyRoutes);

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} 🚀`);
    });
  } catch (err) {
    console.error("Server start failed:", err);
    process.exit(1);
  }
};

start();
