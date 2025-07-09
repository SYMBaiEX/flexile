"use client";
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoneyFromCents } from "@/utils/formatMoney";
import { Skeleton } from "@/components/ui/skeleton";
import { Banknote, Users, Receipt, Calculator } from "lucide-react";

interface DividendSummaryProps {
  totalDividendAmount: number; // in cents
  totalInvestors: number;
  totalTaxWithheld: number; // in cents
  totalNetPayout: number; // in cents
  loading?: boolean;
}

interface SummaryCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ReactNode;
  loading?: boolean;
}

const SummaryCard = ({ title, value, description, icon, loading }: SummaryCardProps) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <div className="text-muted-foreground">{icon}</div>
    </CardHeader>
    <CardContent>
      {loading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <>
          <div className="text-2xl font-bold">{value}</div>
          {description ? <p className="text-muted-foreground mt-1 text-xs">{description}</p> : null}
        </>
      )}
    </CardContent>
  </Card>
);

export default function DividendSummary({
  totalDividendAmount,
  totalInvestors,
  totalTaxWithheld,
  totalNetPayout,
  loading,
}: DividendSummaryProps) {
  const effectiveTaxRate =
    totalDividendAmount > 0 ? ((totalTaxWithheld / totalDividendAmount) * 100).toFixed(1) : "0.0";

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <SummaryCard
        title="Total dividend amount"
        value={formatMoneyFromCents(totalDividendAmount)}
        description="Gross amount before taxes"
        icon={<Banknote className="size-4" />}
        loading={loading}
      />
      <SummaryCard
        title="Total investors"
        value={totalInvestors.toLocaleString()}
        description={`${totalInvestors === 1 ? "investor" : "investors"} receiving dividends`}
        icon={<Users className="size-4" />}
        loading={loading}
      />
      <SummaryCard
        title="Total tax withheld"
        value={formatMoneyFromCents(totalTaxWithheld)}
        description={`Effective rate: ${effectiveTaxRate}%`}
        icon={<Receipt className="size-4" />}
        loading={loading}
      />
      <SummaryCard
        title="Total net payout"
        value={formatMoneyFromCents(totalNetPayout)}
        description="Amount after tax withholding"
        icon={<Calculator className="size-4" />}
        loading={loading}
      />
    </div>
  );
}
