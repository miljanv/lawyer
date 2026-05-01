import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { initDb } from "./db";
import documentRoutes from "./routes/documentRoutes";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(documentRoutes);

async function startServer(): Promise<void> {
  await initDb();

  app.listen(3001, () => {
    console.log("Server running on 3001");
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
