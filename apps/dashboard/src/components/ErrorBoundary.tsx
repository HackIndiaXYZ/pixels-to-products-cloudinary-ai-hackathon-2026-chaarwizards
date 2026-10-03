import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ClayCard } from './ClayCard';

/** A render crash shows an explanation instead of a blank page. This catches client-side faults
 *  only; it is not a substitute for the per-query error state. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { message: null };
  }

  static getDerivedStateFromError(error: unknown): { message: string } {
    return { message: error instanceof Error ? error.message : 'The interface could not render.' };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Panchnama render error', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.message === null) return this.props.children;
    return (
      <div className="pn-harness">
        <ClayCard title="The interface hit an error">
          <p className="pn-state-body">
            No data is shown while the view is broken — an unreadable screen is more honest than a
            plausible one.
          </p>
          <p className="pn-mono pn-unknown">{this.state.message}</p>
          <div className="pn-row">
            <button type="button" className="pn-btn" onClick={() => this.setState({ message: null })}>
              Try again
            </button>
            <button type="button" className="pn-btn" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </ClayCard>
      </div>
    );
  }
}