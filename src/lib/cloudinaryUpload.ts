import multer from 'multer';
import type { Request } from 'express';
import type { UploadApiErrorResponse, UploadApiResponse } from 'cloudinary';
import cloudinary from '../config/cloudinary';

class CloudinaryStorage implements multer.StorageEngine {
  constructor(private readonly folder: string) {}

  _handleFile(
    _req: Request,
    file: Express.Multer.File,
    callback: (error?: unknown, info?: Partial<Express.Multer.File>) => void
  ): void {
    const upload = cloudinary.uploader.upload_stream(
      {
        folder: this.folder,
        resource_type: 'auto',
        use_filename: false,
        unique_filename: true
      },
      (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
        if (error || !result) return callback(error ?? new Error('Cloudinary upload failed'));
        callback(undefined, {
          path: result.secure_url,
          filename: result.public_id,
          size: result.bytes
        });
      }
    );

    file.stream.on('error', callback);
    file.stream.pipe(upload);
  }

  _removeFile(
    _req: Request,
    file: Express.Multer.File,
    callback: (error: Error | null) => void
  ): void {
    if (!file.filename) return callback(null);
    cloudinary.uploader.destroy(file.filename, { resource_type: 'image' })
      .then(() => callback(null))
      .catch((error: Error) => callback(error));
  }
}

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/dicom'
]);

export const createCloudinaryUpload = (folder: string) => multer({
  storage: new CloudinaryStorage(folder),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5,
    fields: 20,
    fieldSize: 1024 * 1024
  },
  fileFilter: (_req, file, callback) => {
    callback(null, allowedMimeTypes.has(file.mimetype));
  }
});
