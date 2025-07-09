"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDate } from "@internationalized/date";
import { Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import DataTable, { createColumnHelper, useTable } from "@/components/DataTable";
import DatePicker from "@/components/DatePicker";
import MainLayout from "@/components/layouts/Main";
import { MutationStatusButton } from "@/components/MutationButton";
import NumberInput from "@/components/NumberInput";
import Placeholder from "@/components/Placeholder";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { useCurrentCompany } from "@/global";
import { trpc } from "@/trpc/client";
import { formatMoney } from "@/utils/formatMoney";

// Form schema for dividend computation
const formSchema = z.object({
  totalAmount: z.number().positive("Total amount must be greater than 0"),
  isDividend: z.boolean().default(true),
  issuanceDate: z.instanceof(CalendarDate, { message: "Issuance date is required" }),
});

type FormData = z.infer<typeof formSchema>;

// Type for dividend preview data
type DividendPreview = {
  investorId?: string;
  investorName?: string;
  numberOfShares: number;
  shareClass: string;
  totalAmountInUsd: number;
  dividendAmountInUsd: number;
  preferredDividendAmountInUsd: number;
  qualifiedDividendAmountUsd: number;
};

// Column helper for preview table
const columnHelper = createColumnHelper<DividendPreview>();
const columns = [
  columnHelper.accessor("investorName", {
    header: "Investor",
    cell: (info) => <strong>{info.getValue() || "Unknown"}</strong>,
  }),
  columnHelper.simple("shareClass", "Share class"),
  columnHelper.simple("numberOfShares", "Shares", (value) => value.toLocaleString(), "numeric"),
  columnHelper.simple("totalAmountInUsd", "Total amount", (value) => formatMoney(value), "numeric"),
  columnHelper.simple("dividendAmountInUsd", "Common dividend", (value) => formatMoney(value), "numeric"),
  columnHelper.simple("preferredDividendAmountInUsd", "Preferred dividend", (value) => formatMoney(value), "numeric"),
];

export default function DividendComputation() {
  const router = useRouter();
  const company = useCurrentCompany();
  const [previewData, setPreviewData] = React.useState<DividendPreview[]>([]);
  const [showPreview, setShowPreview] = React.useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      isDividend: true,
    },
  });

  // Preview mutation - calculates dividend allocations without creating
  const previewMutation = trpc.dividendComputations.preview.useMutation({
    onSuccess: (data) => {
      setPreviewData(data.outputs);
      setShowPreview(true);
    },
  });

  // Create mutation - actually creates the dividend round through computation
  const createComputationMutation = trpc.dividendComputations.create.useMutation();
  const generateDividendsMutation = trpc.dividendComputations.generateDividends.useMutation({
    onSuccess: () => {
      // Redirect to dividend rounds list page since we don't have the numeric ID
      router.push(`/equity/dividend_rounds`);
    },
  });

  // Handle preview calculation
  const handlePreview = form.handleSubmit((values) => {
    const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    previewMutation.mutate({
      companyId: company.id,
      totalAmountInUsd: values.totalAmount,
      returnOfCapital: !values.isDividend,
      dividendsIssuanceDate: values.issuanceDate.toDate(localTimeZone).toISOString().split("T")[0] || "",
    });
  });

  // Handle final submission
  const handleSubmit = async () => {
    const values = form.getValues();
    const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    try {
      // First create the computation with outputs
      const computation = await createComputationMutation.mutateAsync({
        companyId: company.id,
        totalAmountInUsd: values.totalAmount,
        returnOfCapital: !values.isDividend,
        dividendsIssuanceDate: values.issuanceDate.toDate(localTimeZone).toISOString().split("T")[0] || "",
        outputs: previewData.map((preview) => ({
          companyInvestorId: preview.investorId,
          investorName: preview.investorName || "",
          shareClass: preview.shareClass,
          numberOfShares: preview.numberOfShares,
          hurdleRate: undefined,
          originalIssuePriceInUsd: undefined,
          preferredDividendAmountInUsd: preview.preferredDividendAmountInUsd,
          dividendAmountInUsd: preview.dividendAmountInUsd,
          totalAmountInUsd: preview.totalAmountInUsd,
          qualifiedDividendAmountUsd: preview.qualifiedDividendAmountUsd,
        })),
      });

      // Then generate the dividend round
      await generateDividendsMutation.mutateAsync({
        companyId: company.id,
        computationId: computation.externalId,
      });
    } catch {
      // Error is handled by mutation error state
    }
  };

  const table = useTable({ columns, data: previewData });

  // Calculate totals for summary
  const totals = React.useMemo(() => {
    if (!previewData.length) return null;

    const totalAmount = previewData.reduce((sum, item) => sum + item.totalAmountInUsd, 0);
    const totalDividend = previewData.reduce((sum, item) => sum + item.dividendAmountInUsd, 0);
    const totalPreferred = previewData.reduce((sum, item) => sum + item.preferredDividendAmountInUsd, 0);
    const totalQualified = previewData.reduce((sum, item) => sum + item.qualifiedDividendAmountUsd, 0);

    return {
      total: formatMoney(totalAmount),
      dividend: formatMoney(totalDividend),
      preferred: formatMoney(totalPreferred),
      qualified: formatMoney(totalQualified),
    };
  }, [previewData]);

  return (
    <MainLayout
      title="Dividend computation"
      headerActions={
        <Button variant="outline" asChild>
          <Link href="/equity/dividend_rounds">Cancel</Link>
        </Button>
      }
    >
      <div className="grid gap-6">
        {/* Form Section */}
        <Card>
          <CardHeader>
            <CardTitle>Dividend details</CardTitle>
            <CardDescription>
              Enter the dividend information to calculate allocations for all shareholders
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={(e) => void handlePreview(e)} className="grid gap-4">
                <FormField
                  control={form.control}
                  name="totalAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total dividend amount</FormLabel>
                      <FormControl>
                        <NumberInput {...field} prefix="$" placeholder="0.00" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isDividend"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          label={
                            <div className="flex flex-col gap-1">
                              <div>Dividend payment</div>
                              <div className="text-muted-foreground text-sm">
                                {field.value
                                  ? "This is a dividend distribution (taxable)"
                                  : "This is a return of capital (may reduce cost basis)"}
                              </div>
                            </div>
                          }
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="issuanceDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <DatePicker {...field} label="Issuance date" granularity="day" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-sm">
                  <Info className="size-4 shrink-0 text-blue-600" />
                  <span className="text-blue-900">
                    The dividend will be distributed based on share ownership and any preferred dividend rights
                  </span>
                </div>

                <MutationStatusButton
                  className="justify-self-start"
                  type="submit"
                  mutation={previewMutation}
                  loadingText="Calculating..."
                  disabled={!form.formState.isValid}
                >
                  Preview allocations
                </MutationStatusButton>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Preview Section */}
        {showPreview && previewData.length > 0 ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Allocation preview</CardTitle>
                <CardDescription>
                  Review the dividend allocation for each shareholder before creating the dividend round
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <DataTable table={table} />
              </CardContent>
            </Card>

            {/* Summary Card */}
            {totals ? (
              <Card>
                <CardHeader>
                  <CardTitle>Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total distribution</span>
                      <span className="font-medium">{totals.total}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Common dividends</span>
                      <span className="font-medium">{totals.dividend}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Preferred dividends</span>
                      <span className="font-medium">{totals.preferred}</span>
                    </div>
                    <div className="flex justify-between border-t pt-3">
                      <span className="text-muted-foreground">Qualified dividends</span>
                      <span className="font-medium">{totals.qualified}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {/* Action Buttons */}
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowPreview(false);
                  setPreviewData([]);
                }}
              >
                Back to edit
              </Button>
              <MutationStatusButton
                mutation={generateDividendsMutation}
                loadingText="Creating dividend round..."
                onClick={handleSubmit}
                disabled={createComputationMutation.isPending}
              >
                Create dividend round
              </MutationStatusButton>
            </div>
          </>
        ) : null}

        {/* Empty State */}
        {showPreview && previewData.length === 0 ? (
          <Placeholder>
            No shareholders found. Please ensure there are shareholders with shares before creating a dividend.
          </Placeholder>
        ) : null}
      </div>
    </MainLayout>
  );
}
