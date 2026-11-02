import React, { Component } from "react";
import { Link } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { Empty } from "./common";

// Catches render errors in a page so the shell stays usable. Give it a `key`
// that changes on navigation to clear the error.
export class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("This page failed to render:", error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert">
        <Empty
          icon={TriangleAlert}
          title="Something went wrong"
          text={this.state.error.message || "This page could not be shown."}
          action={
            <div className="button-row">
              <button
                className="btn primary"
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
              <Link className="btn" to="/dashboard">
                Go to the dashboard
              </Link>
            </div>
          }
        />
      </div>
    );
  }
}
