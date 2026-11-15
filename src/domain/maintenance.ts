import type { TicketStatus } from './enums';

const TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  open: ['in_progress', 'waiting', 'closed'],
  in_progress: ['waiting', 'resolved'],
  waiting: ['in_progress', 'resolved'],
  resolved: ['closed', 'in_progress'], // in_progress = reopen
  closed: [],
};

export function nextTicketStatuses(from: TicketStatus): readonly TicketStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isActiveTicket(status: TicketStatus): boolean {
  return status !== 'resolved' && status !== 'closed';
}
