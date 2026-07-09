import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { register } from "../api/auth";
import "../styles/page.css";

type RegisterResponse = {
  user: {
    id: string;
    email: string;
    status: string;
    role: string;
    createdAt: string;
  };
  verifyUrl: string;
  token: string;
};

export default function RegisterPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [registerResult, setRegisterResult] = useState<RegisterResponse | null>(null);
  const [verified, setVerified] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setError("");

    try {
      const data = await register(email, password);
      setRegisterResult(data);
      setMessage("임시 이메일 인증 버튼을 눌러 가입해주세요. (10분안에 누르지 않을시 회원가입이 실패합니다)");
    } catch (err: any) {
      setError(err?.response?.data?.message || "회원가입 실패");
    }
  };

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

  const handleOpenVerifyLink = async () => {
    if (!registerResult?.token) return;
  
    try {
      setMessage("");
      setError("");
  
      const res = await fetch(
        `${API_BASE_URL}/auth/verify-email?token=${registerResult.token}`,
      );
  
      if (!res.ok) {
        throw new Error("이메일 인증 실패");
      }
  
      setMessage("회원가입 완료 (임시 이메일 인증 완료)");
      setVerified(true);
  
    } catch (err) {
      setError("이메일 인증 실패");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand-mark">CS</span>
          <span className="auth-brand-name">Custody Vault</span>
        </div>

        <div className="auth-title">회원가입</div>
        <div className="auth-subtitle">
          {registerResult
            ? "이메일 인증을 완료하고 서비스를 이용해보세요."
            : "이메일과 비밀번호로 새 계정을 만드세요."}
        </div>

        {!registerResult ? (
          <>
            <form onSubmit={handleRegister}>
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
                회원가입
              </button>
            </form>

            <div className="auth-footer">
              이미 계정이 있나요? <a href="/login">로그인</a>
            </div>
          </>
        ) : (
          <div>
            {message && <div className="alert alert--info" style={{ marginBottom: "16px" }}>{message}</div>}

            <div className="info-box info-box--neutral" style={{ marginBottom: "16px" }}>
              이메일: {registerResult.user.email}
              <br />
              상태: {registerResult.user.status}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {!verified && (
                <button className="btn btn--primary" onClick={handleOpenVerifyLink}>
                  임시 이메일 인증 하기
                </button>
              )}
              <button className="btn btn--secondary" onClick={() => navigate("/login")}>
                로그인 페이지로 이동
              </button>
            </div>
          </div>
        )}

        {error && <div className="alert alert--danger" style={{ marginTop: "16px" }}>{error}</div>}
      </div>
    </div>
  );
}
