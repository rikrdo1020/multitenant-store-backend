import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  fromName?: string;
}

@Injectable()
export class ResendService {
  private readonly logger = new Logger(ResendService.name);
  private readonly client: Resend;
  private readonly defaultFrom: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.client = new Resend(apiKey);
    this.defaultFrom = 'noreply@multitenant-store.com';
  }

  async sendEmail(options: SendEmailOptions): Promise<void> {
    const from = options.from
      ? `${options.fromName ?? 'Store'} <${options.from}>`
      : this.defaultFrom;

    try {
      const { error } = await this.client.emails.send({
        from,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        html: options.html,
      });

      if (error) {
        this.logger.error(`Resend error: ${error.message}`);
        throw new Error(`Email delivery failed: ${error.message}`);
      }

      this.logger.log(`Email sent to ${options.to}: "${options.subject}"`);
    } catch (err) {
      this.logger.error('Failed to send email', err);
      throw err;
    }
  }

  async sendPasswordReset(to: string, resetUrl: string, fromEmail?: string): Promise<void> {
    await this.sendEmail({
      to,
      subject: 'Reset your password',
      from: fromEmail,
      html: `
        <p>You requested a password reset.</p>
        <p><a href="${resetUrl}">Click here to reset your password</a></p>
        <p>This link expires in 1 hour. If you did not request this, ignore this email.</p>
      `,
    });
  }
}
