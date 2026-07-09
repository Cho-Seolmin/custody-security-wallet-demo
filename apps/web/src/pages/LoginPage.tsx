import { useState } from "react";
import { login } from "../api/auth";
import { useLocation, useNavigate } from "react-router-dom";
import "../styles/page.css";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from || "/dashboard";

  const [email, setEmail] = useState("test@test.com");
  const [password, setPassword] = useState("1234");
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const data = await login(email, password);
      localStorage.setItem("accessToken", data.accessToken);
      navigate(from);
    } catch (err: any) {
      setError(err?.response?.data?.message || "로그인 실패");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand-mark">CS</span>
          <span className="auth-brand-name">Custody Vault</span>
        </div>

        <div className="auth-title">로그인</div>
        <div className="auth-subtitle">계정 정보를 입력하고 대시보드로 이동하세요.</div>

        <form onSubmit={handleLogin}>
          <div className="field">
            <label className="input-label">이메일</label>
            <input
              type="email"
              className="input"
              placeholder="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="input-label">비밀번호</label>
            <input
              type="password"
              className="input"
              placeholder="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn--primary" style={{ width: "100%" }}>
            로그인
          </button>
        </form>

        {error && <div className="alert alert--danger" style={{ marginTop: "16px" }}>{error}</div>}

        <div className="info-box info-box--neutral" style={{ marginTop: "20px" }}>
          테스트용 어드민 계정
          <div style={{ marginTop: "4px" }}>
            1: test@test.com / 1234
            <br />
            2: test2@test.com / 1234
          </div>
        </div>

        <div className="auth-footer">
          계정이 없나요? <a href="/register">회원가입</a>
        </div>
      </div>
    </div>
  );
}
