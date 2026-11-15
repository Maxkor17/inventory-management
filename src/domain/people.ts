import type { Person } from '@/domain/types';

export const fullName = (p: Pick<Person, 'firstName' | 'lastName'>): string => `${p.firstName} ${p.lastName}`.trim();
