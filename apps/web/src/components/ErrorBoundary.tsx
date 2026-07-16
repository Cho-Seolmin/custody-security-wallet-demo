import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            background: "var(--color-bg)",
            color: "var(--color-text)",
          }}
        >
          <div className="card section-card" style={{ maxWidth: "420px", textAlign: "center" }}>
            <h1 style={{ fontSize: "18px", marginBottom: "8px" }}>화면을 불러오지 못했습니다</h1>
            <p style={{ color: "var(--color-text-muted)", marginBottom: "16px" }}>
              예기치 않은 오류가 발생했습니다. 페이지를 새로고침해 주세요.
            </p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => window.location.reload()}
            >
              새로고침
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
