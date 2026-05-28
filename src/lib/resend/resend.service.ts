import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailAction } from '@prisma/client';
import { Resend } from 'resend';
import { EmailSecurityService } from './email-security.service';
import { EmailDeliveryReservation } from './email-security.types';
import { maskEmailList } from '../../common/utils/privacy';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  fromName?: string;
}

export interface SendEmailPolicy
  extends Omit<EmailDeliveryReservation, 'recipient'> {
  recipient?: string;
}

@Injectable()
export class ResendService {
  private readonly logger = new Logger(ResendService.name);
  private readonly client: Resend;
  private readonly defaultFrom: string;
  private readonly defaultFromName: string;

  constructor(
    private readonly config: ConfigService,
    private readonly emailSecurity: EmailSecurityService,
  ) {
    const apiKey = this.config.getOrThrow<string>('RESEND_API_KEY');
    const defaultFromEmail = this.config.getOrThrow<string>('RESEND_FROM_EMAIL');
    this.defaultFromName = this.config.getOrThrow<string>('RESEND_FROM_NAME');
    this.client = new Resend(apiKey);
    this.defaultFrom = `${this.defaultFromName} <${defaultFromEmail}>`;
  }

  async sendEmail(
    options: SendEmailOptions,
    policy?: SendEmailPolicy,
  ): Promise<void> {
    const reservation = policy
      ? await this.emailSecurity.reserveDelivery({
          ...policy,
          recipient: policy.recipient ?? this.primaryRecipient(options.to),
        })
      : undefined;

    if (reservation?.skipped) return;

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

      await this.emailSecurity.markSent(reservation?.id);
      this.logger.log(
        `Email sent to ${maskEmailList(options.to)}: "${options.subject}"`,
      );
    } catch (err) {
      await this.emailSecurity.markFailed(reservation?.id, err);
      this.logger.error(
        `Failed to send email to ${maskEmailList(options.to)}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw err;
    }
  }

  async sendPasswordReset(
    to: string,
    resetUrl: string,
    policy?: SendEmailPolicy,
    fromEmail?: string,
  ): Promise<void> {
    await this.sendEmail(
      {
        to,
        subject: 'Restablecer tu contrasena',
        from: fromEmail,
        html: `
          <p>Recibimos una solicitud para restablecer tu contrasena.</p>
          <p><a href="${this.escapeHtml(resetUrl)}">Crear nueva contrasena</a></p>
          <p>Este enlace expira en 1 hora. Si no solicitaste este cambio, ignora este correo.</p>
        `,
      },
      policy ?? {
        action: EmailAction.password_reset,
        recipient: to,
        actorKey: to,
        dedupeKey: resetUrl,
      },
    );
  }

  async sendMemberInvite(
    to: string,
    inviteUrl: string,
    tenantName: string,
    role: string,
    inviterName?: string | null,
    policy?: SendEmailPolicy,
    fromEmail?: string,
  ): Promise<void> {
    const safeTenantName = this.escapeHtml(tenantName);
    const inviterLine = inviterName
      ? `<p>${this.escapeHtml(inviterName)} te invito a colaborar en ${safeTenantName}.</p>`
      : `<p>Te invitaron a colaborar en ${safeTenantName}.</p>`;

    await this.sendEmail(
      {
        to,
        subject: `Invitacion para unirte a ${tenantName}`,
        from: fromEmail,
        html: `
          ${inviterLine}
          <p>Rol asignado: <strong>${this.escapeHtml(role)}</strong>.</p>
          <p><a href="${this.escapeHtml(inviteUrl)}">Aceptar invitacion</a></p>
          <p>Este enlace expira en 7 dias. Si no esperabas esta invitacion, ignora este correo.</p>
        `,
      },
      policy ?? {
        action: EmailAction.member_invite,
        recipient: to,
        actorKey: to,
        dedupeKey: inviteUrl,
      },
    );
  }

  private primaryRecipient(to: string | string[]): string {
    return Array.isArray(to) ? to[0] : to;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
