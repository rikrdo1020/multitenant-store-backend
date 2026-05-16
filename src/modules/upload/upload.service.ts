import { BadRequestException, Injectable } from '@nestjs/common';
import { CloudinaryService } from '../../lib/cloudinary/cloudinary.service';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface UploadResult {
  url: string;
  publicId: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

@Injectable()
export class UploadService {
  constructor(private readonly cloudinary: CloudinaryService) {}

  async uploadImage(file: Express.Multer.File, folder?: string): Promise<UploadResult> {
    if (!file) {
      throw new BadRequestException({ code: 'NO_FILE', message: 'No file provided' });
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException({
        code: 'INVALID_FILE_TYPE',
        message: `File type not allowed. Accepted: ${ALLOWED_MIME_TYPES.join(', ')}`,
      });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: `File exceeds max size of ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB`,
      });
    }

    const result = await this.cloudinary.uploadBuffer(file.buffer, { folder });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
    };
  }

  async deleteImage(publicId: string): Promise<void> {
    await this.cloudinary.deleteByPublicId(publicId);
  }
}
