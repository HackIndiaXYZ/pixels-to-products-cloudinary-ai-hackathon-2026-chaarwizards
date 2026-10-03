import { useState } from 'react';
import { UNKNOWN_COPY, type Field } from '../lib/state';
import { Icon } from './Icon';

export interface HashDisplayProps {
  label: string;
  value: Field<string | null>;
}

/** Hashes are shown byte-exact in monospace, always in full. Nothing is elided, truncated, or
 *  replaced with a shortened digest: an abbreviated hash cannot be checked against the manifest, so
 *  showing one would misrepresent the record. */
export function HashDisplay({ label, value }: HashDisplayProps) {
  const [copied, setCopied] = useState(false);
  const text = value.state === 'value' ? value.value : null;

  const copy = (): void => {
    if (text === null) return;
    void navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => setCopied(false));
  };

  return (
    <div className="pn-stack-3">
      <div className="pn-row pn-row-wrap">
        <span className="pn-label">{label}</span>
        {text === null ? null : (
          <button
            type="button"
            className="pn-btn pn-btn-sm pn-btn-quiet"
            onClick={copy}
            aria-label={`Copy ${label}`}
          >
            <Icon name={copied === true ? 'check' : 'lock'} size={14} />
            {copied === true ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
      {text === null ? (
        <span className="pn-unknown pn-mono">{UNKNOWN_COPY}</span>
      ) : (
        <div className="pn-hash">
          <code>{text}</code>
        </div>
      )}
    </div>
  );
}