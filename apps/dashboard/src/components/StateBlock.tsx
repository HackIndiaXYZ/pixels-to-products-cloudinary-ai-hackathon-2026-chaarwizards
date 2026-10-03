import type { ReactNode } from 'react';
import { Icon } from './Icon';

export type StateTone = 'neutral' | 'info' | 'warn' | 'fail';

export interface StateBlockProps {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  tone?: StateTone;
  glyph?: 'unknown' | 'warning' | 'lock' | 'evidence';
}

const GLYPH_BY_TONE: Record<StateTone, NonNullable<StateBlockProps['glyph']>> = {
  neutral: 'unknown',
  info: 'evidence',
  warn: 'warning',
  fail: 'lock',
};

export function StateBlock({ title, body, action, tone = 'neutral', glyph }: StateBlockProps) {
  const icon = glyph ?? GLYPH_BY_TONE[tone];
  return (
    <div className="pn-state" role={tone === 'fail' ? 'alert' : 'status'}>
      <span className={tone === 'neutral' ? 'pn-unknown' : undefined}>
        <Icon name={icon} size={20} />
      </span>
      <p className="pn-state-headline">{title}</p>
      {body === undefined ? null : <p className="pn-state-body">{body}</p>}
      {action ?? null}
    </div>
  );
}
