"use client";
import React, { useMemo } from "react";
import DataTable, { createColumnHelper, useTable } from "@/components/DataTable";
import { formatMoney, formatMoneyFromCents } from "@/utils/formatMoney";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Status from "@/components/Status";
import { CircleCheck, Clock, CreditCard } from "lucide-react";

export interface InvestorPreview {
  id: string | number;
  investorName: string;
  investorEmail: string;
  ownershipPercentage: number;
  numberOfShares: number;
  grossDividendAmount: number; // in cents
  taxWithholdingAmount: number; // in cents
  taxWithholdingPercentage: number;
  netPayoutAmount: number; // in cents
  paymentMethod?: "bank_transfer" | "check" | "wire" | "ach";
  paymentStatus?: "pending" | "processing" | "completed" | "failed";
}

interface InvestorPreviewTableProps {
  investors: InvestorPreview[];
  loading?: boolean;
  onRowClick?: (investor: InvestorPreview) => void;
}

const columnHelper = createColumnHelper<InvestorPreview>();

const PaymentMethodBadge = ({ method }: { method?: InvestorPreview["paymentMethod"] }) => {
  if (!method) return <span className="text-muted-foreground">Not set</span>;

  const labels: Record<NonNullable<InvestorPreview["paymentMethod"]>, string> = {
    bank_transfer: "Bank Transfer",
    check: "Check",
    wire: "Wire",
    ach: "ACH",
  };

  return <Badge variant="secondary">{labels[method]}</Badge>;
};

const PaymentStatusIndicator = ({ status }: { status?: InvestorPreview["paymentStatus"] }) => {
  if (!status) return null;

  const statusConfig = {
    pending: { variant: "default" as const, icon: <Clock className="size-4" />, label: "Pending" },
    processing: { variant: "primary" as const, icon: <CreditCard className="size-4" />, label: "Processing" },
    completed: { variant: "success" as const, icon: <CircleCheck className="size-4" />, label: "Completed" },
    failed: { variant: "critical" as const, icon: null, label: "Failed" },
  };

  const config = statusConfig[status];
  return (
    <Status variant={config.variant} icon={config.icon}>
      {config.label}
    </Status>
  );
};

export default function InvestorPreviewTable({ investors, loading, onRowClick }: InvestorPreviewTableProps) {
  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => `${row.investorName} (${row.investorEmail})`, {
        id: "investor",
        header: "Investor",
        cell: (info) => (
          <div>
            <div className="font-medium">{info.row.original.investorName}</div>
            <div className="text-muted-foreground text-sm">{info.row.original.investorEmail}</div>
          </div>
        ),
      }),
      columnHelper.simple("ownershipPercentage", "Ownership", (value) => `${(value * 100).toFixed(2)}%`, "numeric"),
      columnHelper.simple("numberOfShares", "Shares", (value) => value.toLocaleString(), "numeric"),
      columnHelper.simple("grossDividendAmount", "Gross dividend", (value) => formatMoneyFromCents(value), "numeric"),
      columnHelper.accessor("taxWithholdingAmount", {
        header: "Tax withheld",
        cell: (info) => (
          <div className="text-right tabular-nums">
            <div>{formatMoneyFromCents(info.getValue())}</div>
            <div className="text-muted-foreground text-sm">
              ({(info.row.original.taxWithholdingPercentage * 100).toFixed(1)}%)
            </div>
          </div>
        ),
        meta: { numeric: true },
      }),
      columnHelper.simple("netPayoutAmount", "Net payout", (value) => formatMoneyFromCents(value), "numeric"),
      columnHelper.accessor("paymentMethod", {
        header: "Payment method",
        cell: (info) => <PaymentMethodBadge method={info.getValue()} />,
      }),
      columnHelper.accessor("paymentStatus", {
        header: "Status",
        cell: (info) => <PaymentStatusIndicator status={info.getValue()} />,
      }),
    ],
    [],
  );

  const table = useTable({ columns, data: investors });

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <DataTable table={table} caption="Investor dividend preview" onRowClicked={onRowClick} searchColumn="investor" />
  );
}
