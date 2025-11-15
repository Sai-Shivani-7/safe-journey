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
console.log("MONGO_URI:", process.env.MONGO_URI);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log(err));

console.log("Auth routes mounted at /auth");
console.log("History routes mounted at /history");


// app.use("/auth", authRoutes);
// app.use("/history", historyRoutes);
// app.use("/api/auth", require("./routes/auth"));
app.use("/auth", authRoutes);
app.use("/history", historyRoutes);

app.listen(5000, () => console.log("Server running on port 5000"));
 