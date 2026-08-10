import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{ padding: 32, textAlign: "center" }}>
          <h2>页面出现异常</h2>
          <p style={{ color: "#888" }}>
            {this.state.error?.message || "Lmentor 前端在渲染时遇到了一个未处理错误。"}
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
            <button onClick={() => this.setState({ hasError: false, error: undefined })}>
              重试
            </button>
            <button onClick={() => window.location.reload()}>
              重新加载页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
