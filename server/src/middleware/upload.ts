import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getSettingInt, getSettingBool } from '../services/settingsCache';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const videoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
const audioTypes = ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm'];
const documentTypes = ['application/pdf', 'text/plain', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

const fileFilter = (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Build allowed types from admin settings
  const allowed: string[] = [];

  if (getSettingBool('allow_image_uploads', true)) allowed.push(...imageTypes);
  if (getSettingBool('allow_video_uploads', true)) allowed.push(...videoTypes);
  if (getSettingBool('allow_audio_uploads', true)) allowed.push(...audioTypes);
  if (getSettingBool('allow_document_uploads', true)) allowed.push(...documentTypes);

  if (allowed.length === 0) {
    cb(new Error('File uploads are currently disabled'));
    return;
  }

  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${file.mimetype}`));
  }
};

// Dynamic multer instance that reads settings at request time
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    // Use a high limit here; we enforce the real limit in middleware below
    fileSize: 100 * 1024 * 1024, // 100MB hard cap
  },
});

// Middleware to check file size against admin settings AFTER upload
import { Request, Response, NextFunction } from 'express';

export function enforceFileSize(req: Request, res: Response, next: NextFunction): void {
  if (!req.file && (!req.files || (Array.isArray(req.files) && req.files.length === 0))) {
    next();
    return;
  }

  const maxMb = getSettingInt('max_file_upload_mb', 25);
  const maxBytes = maxMb * 1024 * 1024;

  const files = req.file ? [req.file] : (Array.isArray(req.files) ? req.files : []);
  for (const file of files) {
    if (file.size > maxBytes) {
      res.status(413).json({ error: `File too large. Maximum size is ${maxMb}MB.` });
      return;
    }
  }
  next();
}
