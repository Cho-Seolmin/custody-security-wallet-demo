import { approveWithdraw, rejectWithdraw } from "../api/admin";
import type { WithdrawItem } from "../types/wallet";
import { formatEther } from "ethers";
import "../styles/page.css";

type Props = {
  items: WithdrawItem[];
  onRefresh: () => Promise<void>;
};

export default function AdminWithdrawList({ items, onRefresh }: Props) {
  const getStatusTone = (status: string) => {
    switch (status) {
      case "EXECUTED":
        return "success";
      case "FAILED":
        return "danger";
      case "PENDING":
        return "warning";
      case "PROCESSING":
      case "QUEUED":
        return "primary";
      case "REJECTED":
      case "EXPIRED":
      default:
        return "gray";
    }
  };

  const getStatusLabel = (item: WithdrawItem) => {
    if (
      item.status === "PENDING" &&
      typeof item.approvalCount === "number"
    ) {
      return `PENDING (${item.approvalCount}/${item.requiredApprovalCount ?? 2})`;
    }

    return item.status;
  };

  const handleApprove = async (id: string) => {
    const ok = window.confirm("정말 승인하시겠습니까?");
    if (!ok) return;

    try {
      await approveWithdraw(id);
      await onRefresh();
      alert("승인 완료");
    } catch (err: any) {
      alert(err?.response?.data?.message || "승인 실패");
    }
  };

  const handleReject = async (id: string) => {
    const ok = window.confirm("정말 거절하시겠습니까?");
    if (!ok) return;

    try {
      await rejectWithdraw(id);
      await onRefresh();
      alert("거절 완료");
    } catch (err: any) {
      alert(err?.response?.data?.message || "거절 실패");
    }
  };

  if (items.length === 0) {
    return <p className="empty-state">출금 요청이 없습니다.</p>;
  }

  return (
    <div className="history-list">
      {items.map((item) => (
        <div key={item.id} className="history-row">
          <div className="history-row__top">
            <span className="history-row__amount">
              {formatEther(item.amount)} ETH
            </span>
            <span className={`badge badge--${getStatusTone(item.status)}`}>
              {getStatusLabel(item)}
            </span>
          </div>

          <div className="history-row__meta" style={{ marginBottom: "8px" }}>
            <div>
              <span className="history-row__meta-label">요청 ID</span>
              {item.id}
            </div>
            <div>
              <span className="history-row__meta-label">받는 주소</span>
              {item.toAddress}
            </div>
            <div>
              <span className="history-row__meta-label">승인자</span>
              {item.approvedBy ?? "-"}
            </div>
            <div>
              <span className="history-row__meta-label">txHash</span>
              {item.txHash ?? "-"}
            </div>
            <div>
              <span className="history-row__meta-label">생성일</span>
              {new Date(item.createdAt).toLocaleString()}
            </div>
            <div>
              <span className="history-row__meta-label">금액(wei)</span>
              {item.amount}
            </div>
          </div>

          {item.status === "PENDING" && (
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="btn btn--primary" onClick={() => handleApprove(item.id)}>
                승인
              </button>
              <button className="btn btn--danger" onClick={() => handleReject(item.id)}>
                거절
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
