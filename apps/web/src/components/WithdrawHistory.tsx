import type { WithdrawItem } from "../types/wallet";
import { formatEther } from "ethers";
import { shortenAddress } from "../utils/address";
import { getStatusLabel, getStatusTone } from "../utils/withdrawStatus";
import "../styles/page.css";

type Props = {
  items: WithdrawItem[];
};

export default function WithdrawHistory({ items }: Props) {
  if (items.length === 0) {
    return <p className="empty-state">출금 이력이 없습니다.</p>;
  }

  return (
    <div>
      <h4 style={{ marginBottom: "10px", fontSize: "14px" }}>출금 이력</h4>

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

            <div className="history-row__meta">
              <div>
                <span className="history-row__meta-label">받는 주소</span>
                {shortenAddress(item.toAddress)}
              </div>
              <div>
                <span className="history-row__meta-label">승인자</span>
                {item.approvedBy ?? "-"}
              </div>
              <div>
                <span className="history-row__meta-label">txHash</span>
                {item.txHash ? (
                  <a
                    href={`https://sepolia.etherscan.io/tx/${item.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {item.txHash.slice(0, 10)}...
                  </a>
                ) : (
                  "-"
                )}
              </div>
              <div>
                <span className="history-row__meta-label">생성일</span>
                {new Date(item.createdAt).toLocaleString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
