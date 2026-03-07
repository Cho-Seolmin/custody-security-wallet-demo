import { approveWithdraw, rejectWithdraw } from "../api/admin";
import type { WithdrawItem } from "../types/wallet";

type Props = {
  items: WithdrawItem[];
  onRefresh: () => Promise<void>;
};

export default function AdminWithdrawList({ items, onRefresh }: Props) {
  const handleApprove = async (id: string) => {
    try {
      await approveWithdraw(id);
      await onRefresh();
      alert("승인 완료");
    } catch (err: any) {
      alert(err?.response?.data?.message || "승인 실패");
    }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectWithdraw(id);
      await onRefresh();
      alert("거절 완료");
    } catch (err: any) {
      alert(err?.response?.data?.message || "거절 실패");
    }
  };

  if (items.length === 0) {
    return <p>출금 요청이 없습니다.</p>;
  }

  return (
    <div style={{ marginTop: "20px" }}>
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            border: "1px solid #ccc",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "16px",
          }}
        >
          <div>ID: {item.id}</div>
          <div>금액(wei): {item.amount}</div>
          <div>받는 주소: {item.toAddress}</div>
          <div>상태: {item.status}</div>
          <div>승인자: {item.approvedBy ?? "-"}</div>
          <div>txHash: {item.txHash ?? "-"}</div>
          <div>생성일: {new Date(item.createdAt).toLocaleString()}</div>

          {item.status === "PENDING" && (
            <div style={{ marginTop: "12px" }}>
              <button onClick={() => handleApprove(item.id)}>승인</button>
              <button onClick={() => handleReject(item.id)} style={{ marginLeft: "8px" }}>
                거절
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}