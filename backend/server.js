// server.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoutes.js";
import historyRoutes from "./routes/historyRoutes.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Helpful debug logs (remove in production)
console.log("ENV MONGO_URI set?", !!process.env.MONGO_URI);
console.log("ENV JWT_SECRET set?", !!process.env.JWT_SECRET);

const start = async () => {
  try {
    // optional mongoose config for modern drivers
    mongoose.set("strictQuery", false);

    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI, {
      // useNewUrlParser/useUnifiedTopology are defaults in modern mongoose,
      // leaving them here for older versions (harmless if not needed)
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB Connected ✅");

    // mount routes AFTER DB connection (so you don't serve before DB is ready)
    console.log("Mounting routes...");
    app.use("/auth", authRoutes);
    app.use("/history", historyRoutes);
    console.log("Auth routes mounted at /auth");
    console.log("History routes mounted at /history");

    // start server
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} 🚀`);
    });

    // handle mongoose disconnects
    mongoose.connection.on("disconnected", () =>
      console.warn("Mongoose disconnected")
    );
    mongoose.connection.on("error", (err) =>
      console.error("Mongoose connection error:", err)
    );
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1); // non-zero exit (so supervisor tools know it failed)
  }
};

start();

// graceful shutdown
process.on("SIGINT", async () => {
  console.log("SIGINT received — closing server");
  await mongoose.disconnect();
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});