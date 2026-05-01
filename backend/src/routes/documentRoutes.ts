import { Router } from "express";
import multer from "multer";

import {
  askQuestionController,
  listDocumentsController,
  listQaHistoryController,
  uploadDocumentController,
} from "../controllers/documentController";

const router = Router();
const upload = multer({ dest: "uploads/" });

router.post("/upload", upload.single("file"), uploadDocumentController);
router.post("/ask", askQuestionController);
router.get("/documents", listDocumentsController);
router.get("/qa-history", listQaHistoryController);

export default router;
