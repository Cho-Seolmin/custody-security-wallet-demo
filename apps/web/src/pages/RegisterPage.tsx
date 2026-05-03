import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { register } from "../api/auth";

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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setError("");

    try {
      const data = await register(email, password);
      setRegisterResult(data);
      setMessage("회원가입 완료. 인증 링크 열기 버튼을 눌러 가입해주세요. (10분안에 누르지 않을시 회원가입이 실패합니다)");
    } catch (err: any) {
      setError(err?.response?.data?.message || "회원가입 실패");
    }
  };

  const handleOpenVerifyLink = () => {
    if (!registerResult?.verifyUrl) return;
    window.open(registerResult.verifyUrl, "_blank");
  };

  return (
    <div style={{ padding: "40px", maxWidth: "420px" }}>
      <h1>Register</h1>

      {!registerResult ? (
        <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <input
            type="email"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button type="submit">회원가입</button>
        </form>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <p>{message}</p>
          <p>이메일: {registerResult.user.email}</p>
          <p>상태: {registerResult.user.status}</p>

          <button onClick={handleOpenVerifyLink}>인증 링크 열기</button>
          <button onClick={() => navigate("/login")}>로그인 페이지로 이동</button>
        </div>
      )}

      {!registerResult && (
        <p style={{ marginTop: "16px" }}>
          이미 계정이 있나요? <a href="/login">로그인</a>
        </p>
      )}

      {error && <p style={{ color: "red", marginTop: "12px" }}>{error}</p>}
    </div>
  );
}