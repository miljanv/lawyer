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

const PORT = Number(process.env.PORT) || 3001;

async function startServer(): Promise<void> {
  await initDb();

  app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
