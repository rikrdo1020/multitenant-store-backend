import { EmailAction } from '@prisma/client';

export interface EmailDeliveryReservation {
  action: EmailAction;
  recipient: string;
  actorKey?: string;
  tenantId?: string;
  dedupeKey?: string;
}

export interface EmailDeliveryAttempt {
  id?: string;
  skipped: boolean;
  reason?: string;
}
