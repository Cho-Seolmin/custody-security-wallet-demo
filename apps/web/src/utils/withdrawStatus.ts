import type { WithdrawItem, WithdrawStatus } from "../types/wallet";

export type BadgeTone = "success" | "danger" | "warning" | "primary" | "gray";

export function getStatusTone(status: WithdrawStatus): BadgeTone {
  switch (status) {
    case "EXECUTED":
      return "success";
    case "FAILED":
      return "danger";
    case "PENDING":
      return "warning";
    case "PROCESSING":
    case "QUEUED":
    case "APPROVED":
      return "primary";
    case "REJECTED":
    case "EXPIRED":
    default:
      return "gray";
  }
}

export function getStatusLabel(item: WithdrawItem): string {
  const isMultisigPendingApproval =
    item.status === "PENDING" &&
    item.executionType === "MULTISIG" &&
    typeof item.approvalCount === "number";

  if (isMultisigPendingApproval) {
    return `PENDING (${item.approvalCount}/${item.requiredApprovalCount ?? 2})`;
  }

  return item.status;
}
