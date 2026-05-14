import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private readonly config: ConfigService) {
    cloudinary.config({
      cloud_name: this.config.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.config.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadBuffer(
    buffer: Buffer,
    options: { folder?: string; public_id?: string } = {},
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: options.folder ?? 'multitenant-store', public_id: options.public_id },
        (error, result) => {
          if (error) {
            this.logger.error('Cloudinary upload failed', error);
            return reject(error);
          }
          resolve(result!);
        },
      );
      stream.end(buffer);
    });
  }

  async deleteByPublicId(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
    this.logger.log(`Deleted Cloudinary asset: ${publicId}`);
  }

  extractPublicId(url: string): string {
    // https://res.cloudinary.com/<cloud>/image/upload/v123/<folder>/<public_id>.ext
    const parts = url.split('/');
    const fileName = parts[parts.length - 1];
    const folder = parts[parts.length - 2];
    const nameWithoutExt = fileName.split('.')[0];
    return `${folder}/${nameWithoutExt}`;
  }
}
