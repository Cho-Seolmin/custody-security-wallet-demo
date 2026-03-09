import type { WithdrawItem } from "../types/wallet";
import { formatEther } from "ethers";
import { shortenAddress } from "../utils/address";

type Props = {
  items: WithdrawItem[];
};

export default function WithdrawHistory({ items }: Props) {
  if (items.length === 0) {
    return <p>출금 이력이 없습니다.</p>;
  }

  return (
    <div style={{ marginTop: "12px" }}>
      <h4>출금 이력</h4>
      <ul style={{ paddingLeft: "20px" }}>
        {items.map((item) => (
          <li key={item.id} style={{ marginBottom: "10px" }}>
            <div>상태: {item.status}</div>
            <div>금액(ETH): {formatEther(item.amount)}</div>
            <div>받는 주소:{shortenAddress(item.toAddress)}</div>
            <div>승인자: {item.approvedBy ?? "-"}</div>
            <div>
              txHash:{" "}
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
            <div>생성일: {new Date(item.createdAt).toLocaleString()}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}