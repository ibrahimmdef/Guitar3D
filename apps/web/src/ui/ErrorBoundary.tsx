import { Component, type ReactNode } from 'react';

interface Props {
  fallback: (retry: () => void) => ReactNode;
  onError?: (error: unknown) => void;
  children: ReactNode;
}

/** Keeps a crash in one area (e.g. the WebGL stage) from blanking the whole app. */
export class ErrorBoundary extends Component<Props, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[Guitar3D] stage error', error);
    this.props.onError?.(error);
  }

  retry = () => this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));

  render() {
    if (this.state.failed) return this.props.fallback(this.retry);
    return <ErrorBoundaryReset key={this.state.attempt}>{this.props.children}</ErrorBoundaryReset>;
  }
}

const ErrorBoundaryReset = ({ children }: { children: ReactNode }) => <>{children}</>;
