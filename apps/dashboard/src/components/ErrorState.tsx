import { StateBlock } from './StateBlock';

export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <StateBlock
      title={message}
      tone="fail"
      body="The request did not complete. Nothing is shown rather than showing a stale or invented value."
      action={
        onRetry === undefined ? undefined : (
          <button type="button" className="pn-btn" onClick={onRetry}>
            Try again
          </button>
        )
      }
    />
  );
}
