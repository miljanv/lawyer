import { Router } from "express";
import multer from "multer";

import {
  analyzeContractController,
  contractPdfController,
  generateContractController,
  refineContractController,
} from "../controllers/contractController";

const router = Router();
const upload = multer({ dest: "uploads/" });

router.post("/contracts/analyze", upload.single("file"), analyzeContractController);
router.post("/contracts/generate", generateContractController);
router.post("/contracts/refine", refineContractController);
router.post("/contracts/pdf", contractPdfController);

export default router;
