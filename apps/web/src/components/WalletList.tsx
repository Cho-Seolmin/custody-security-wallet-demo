import type { Wallet } from "../types/wallet";
import WalletCard from "./WalletCard";

type Props = {
  wallets: Wallet[];
};

export default function WalletList({ wallets }: Props) {
  if (wallets.length === 0) {
    return <p>지갑이 없습니다.</p>;
  }

  return (
    <div style={{ marginTop: "20px" }}>
      {wallets.map((wallet) => (
        <WalletCard key={wallet.id} wallet={wallet} />
      ))}
    </div>
    
  );
}