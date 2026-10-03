import type { ReactNode } from 'react';
import { StateBlock } from './StateBlock';

export interface EmptyStateProps {
  title: string;
  body?: string;
  action?: ReactNode;
}

/** Empty states always explain why they are empty and what to do next — never a blank panel. */
export function EmptyState({ title, body, action }: EmptyStateProps) {
  return <StateBlock title={title} body={body} action={action} />;
}
