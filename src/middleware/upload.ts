import multer from 'multer';
import { env } from '../config/env.js';

// Memory storage on purpose: the buffer is needed for magic-byte detection and (future) scanning
// before anything touches disk, and the 5 MB cap bounds memory per request. Exactly one file under
// the field name "file"; everything else is a MulterError mapped to UPLOAD_REJECTED in the global
// error handler.
export const uploadSingleFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1 },
}).single('file');
