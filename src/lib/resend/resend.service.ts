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
  private readonly defaultFromName: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.getOrThrow<string>('RESEND_API_KEY');
    const defaultFromEmail = this.config.getOrThrow<string>('RESEND_FROM_EMAIL');
    this.defaultFromName = this.config.getOrThrow<string>('RESEND_FROM_NAME');
    this.client = new Resend(apiKey);
    this.defaultFrom = `${this.defaultFromName} <${defaultFromEmail}>`;
  }

  async sendEmail(options: SendEmailOptions): Promise<void> {
    const from = options.from
      ? `${options.fromName ?? this.defaultFromName} <${options.from}>`
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
      subject: 'Restablecer tu contrasena',
      from: fromEmail,
      html: `
        <p>Recibimos una solicitud para restablecer tu contrasena.</p>
        <p><a href="${resetUrl}">Crear nueva contrasena</a></p>
        <p>Este enlace expira en 1 hora. Si no solicitaste este cambio, ignora este correo.</p>
      `,
    });
  }

  async sendMemberInvite(
    to: string,
    inviteUrl: string,
    tenantName: string,
    role: string,
    inviterName?: string | null,
    fromEmail?: string,
  ): Promise<void> {
    const inviterLine = inviterName
      ? `<p>${inviterName} te invito a colaborar en ${tenantName}.</p>`
      : `<p>Te invitaron a colaborar en ${tenantName}.</p>`;

    await this.sendEmail({
      to,
      subject: `Invitacion para unirte a ${tenantName}`,
      from: fromEmail,
      html: `
        ${inviterLine}
        <p>Rol asignado: <strong>${role}</strong>.</p>
        <p><a href="${inviteUrl}">Aceptar invitacion</a></p>
        <p>Este enlace expira en 7 dias. Si no esperabas esta invitacion, ignora este correo.</p>
      `,
    });
  }
}
