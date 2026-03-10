import { useState } from "react";
import { login } from "../api/auth";
import { useLocation, useNavigate } from "react-router-dom";

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
    <div style={{ padding: "40px" }}>
      <h1>Login</h1>

      <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", width: "300px", gap: "12px" }}>
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

        <button type="submit">로그인</button>
      </form>

      <p>
        계정이 없나요? <a href="/register">회원가입</a>
      </p>

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}