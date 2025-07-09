import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  companyInvestors,
  dividendComputations,
  dividendComputationOutputs,
  dividendRounds,
  dividends,
} from "@/db/schema";
import { companyProcedure, createRouter } from "@/trpc";

// Define proper types for backend API responses
interface BackendDividendOutput {
  company_investor_external_id?: string;
  investor_name?: string;
  share_class: string;
  number_of_shares: number;
  hurdle_rate?: number;
  original_issue_price_in_usd?: number;
  preferred_dividend_amount_in_usd: number;
  dividend_amount_in_usd: number;
  total_amount_in_usd: number;
  qualified_dividend_amount_usd: number;
}

interface BackendPreviewResponse {
  total_amount_in_usd: number;
  dividends_issuance_date: string;
  return_of_capital: boolean;
  outputs: BackendDividendOutput[];
}

interface DividendComputationOutput {
  id: string;
  companyInvestorId?: string;
  investorName?: string;
  investorEmail?: string;
  shareClass: string;
  numberOfShares: number;
  hurdleRate?: number;
  originalIssuePriceInUsd?: number;
  preferredDividendAmountInUsd: number;
  dividendAmountInUsd: number;
  totalAmountInUsd: number;
  qualifiedDividendAmountUsd: number;
  companyInvestor?: {
    externalId: string;
    user?: {
      firstName: string;
      lastName: string;
      email: string;
    };
  };
}

const dividendComputationOutputSchema = z.object({
  companyInvestorId: z.string().optional(),
  investorName: z.string().optional(),
  shareClass: z.string(),
  numberOfShares: z.number(),
  hurdleRate: z.number().optional(),
  originalIssuePriceInUsd: z.number().optional(),
  preferredDividendAmountInUsd: z.number(),
  dividendAmountInUsd: z.number(),
  totalAmountInUsd: z.number(),
  qualifiedDividendAmountUsd: z.number(),
});

export const dividendComputationsRouter = createRouter({
  create: companyProcedure
    .input(
      z.object({
        totalAmountInUsd: z.number().positive(),
        dividendsIssuanceDate: z.string(),
        returnOfCapital: z.boolean(),
        outputs: z.array(dividendComputationOutputSchema),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.companyAdministrator && !ctx.companyLawyer) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return await db.transaction(async (tx) => {
        // Create the dividend computation
        const [computation] = await tx
          .insert(dividendComputations)
          .values({
            companyId: ctx.company.id,
            totalAmountInUsd: input.totalAmountInUsd.toString(),
            dividendsIssuanceDate: input.dividendsIssuanceDate,
            returnOfCapital: input.returnOfCapital,
          })
          .returning();

        if (!computation) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create dividend computation" });
        }

        // Create the outputs
        const outputsToInsert = await Promise.all(
          input.outputs.map(async (output) => {
            let companyInvestorId: bigint | null = null;

            if (output.companyInvestorId) {
              const investor = await tx.query.companyInvestors.findFirst({
                where: eq(companyInvestors.externalId, output.companyInvestorId),
              });
              if (investor) {
                companyInvestorId = investor.id;
              }
            }

            return {
              dividendComputationId: computation.id,
              companyInvestorId,
              investorName: output.investorName,
              shareClass: output.shareClass,
              numberOfShares: BigInt(output.numberOfShares),
              hurdleRate: output.hurdleRate?.toString(),
              originalIssuePriceInUsd: output.originalIssuePriceInUsd?.toString(),
              preferredDividendAmountInUsd: output.preferredDividendAmountInUsd.toString(),
              dividendAmountInUsd: output.dividendAmountInUsd.toString(),
              totalAmountInUsd: output.totalAmountInUsd.toString(),
              qualifiedDividendAmountUsd: output.qualifiedDividendAmountUsd.toString(),
            };
          }),
        );

        const outputs = await tx.insert(dividendComputationOutputs).values(outputsToInsert).returning();

        if (!computation) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Computation not found after creation" });
        }

        return {
          ...computation,
          outputs,
        };
      });
    }),

  preview: companyProcedure
    .input(
      z.object({
        totalAmountInUsd: z.number().positive(),
        dividendsIssuanceDate: z.string(),
        returnOfCapital: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.companyAdministrator && !ctx.companyLawyer) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Call backend API to calculate dividend preview
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/companies/${ctx.company.externalId}/dividend_computations/preview`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...ctx.headers,
          },
          body: JSON.stringify({
            total_amount_in_usd: input.totalAmountInUsd,
            dividends_issuance_date: input.dividendsIssuanceDate,
            return_of_capital: input.returnOfCapital,
          }),
        },
      );

      if (!response.ok) {
        let errorMessage = "Failed to calculate dividend preview";
        try {
          const error = await response.json();
          errorMessage =
            typeof error === "object" && error !== null && "error_message" in error
              ? String(error.error_message) || errorMessage
              : errorMessage;
        } catch {
          // If we can't parse the error response, use the default message
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: errorMessage,
        });
      }

      const data = await response.json();

      // Type check the response data
      const typedData: BackendPreviewResponse = (() => {
        if (
          typeof data === "object" &&
          data !== null &&
          "total_amount_in_usd" in data &&
          "dividends_issuance_date" in data &&
          "return_of_capital" in data &&
          "outputs" in data &&
          Array.isArray(data.outputs)
        ) {
          return {
            total_amount_in_usd: String(data.total_amount_in_usd),
            dividends_issuance_date: String(data.dividends_issuance_date),
            return_of_capital: Boolean(data.return_of_capital),
            outputs: data.outputs,
          };
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Invalid response format from backend API",
        });
      })();

      // Transform the backend response to match our schema
      return {
        totalAmountInUsd: typedData.total_amount_in_usd,
        dividendsIssuanceDate: typedData.dividends_issuance_date,
        returnOfCapital: typedData.return_of_capital,
        outputs: typedData.outputs.map((output: BackendDividendOutput) => ({
          companyInvestorId: output.company_investor_external_id,
          investorName: output.investor_name,
          shareClass: output.share_class,
          numberOfShares: output.number_of_shares,
          hurdleRate: output.hurdle_rate,
          originalIssuePriceInUsd: output.original_issue_price_in_usd,
          preferredDividendAmountInUsd: output.preferred_dividend_amount_in_usd,
          dividendAmountInUsd: output.dividend_amount_in_usd,
          totalAmountInUsd: output.total_amount_in_usd,
          qualifiedDividendAmountUsd: output.qualified_dividend_amount_usd,
        })),
      };
    }),

  list: companyProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).optional().default(50),
        offset: z.number().min(0).optional().default(0),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.companyAdministrator && !ctx.companyLawyer) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const computations = await db.query.dividendComputations.findMany({
        where: eq(dividendComputations.companyId, ctx.company.id),
        orderBy: [desc(dividendComputations.createdAt)],
        limit: input.limit,
        offset: input.offset,
        with: {
          outputs: {
            columns: {
              shareClass: true,
              numberOfShares: true,
              totalAmountInUsd: true,
              investorName: true,
            },
          },
        },
      });

      return computations.map((computation) => ({
        id: computation.externalId,
        totalAmountInUsd: parseFloat(computation.totalAmountInUsd),
        dividendsIssuanceDate: computation.dividendsIssuanceDate,
        returnOfCapital: computation.returnOfCapital,
        createdAt: computation.createdAt,
        numberOfInvestors: new Set(computation.outputs.map((o) => o.investorName)).size,
        totalShares: computation.outputs.reduce((sum, o) => sum + Number(o.numberOfShares), 0),
      }));
    }),

  get: companyProcedure.input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    if (!ctx.companyAdministrator && !ctx.companyLawyer) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    const computation = await db.query.dividendComputations.findFirst({
      where: and(eq(dividendComputations.companyId, ctx.company.id), eq(dividendComputations.externalId, input.id)),
      with: {
        outputs: {
          with: {
            companyInvestor: {
              with: {
                user: true,
              },
            },
          },
        },
      },
    });

    if (!computation) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    return {
      id: computation.externalId,
      totalAmountInUsd: parseFloat(computation.totalAmountInUsd),
      dividendsIssuanceDate: computation.dividendsIssuanceDate,
      returnOfCapital: computation.returnOfCapital,
      createdAt: computation.createdAt,
      outputs: computation.outputs.map(
        (output): DividendComputationOutput => ({
          id: output.id.toString(),
          companyInvestorId: output.companyInvestor?.externalId,
          investorName:
            output.investorName ||
            (output.companyInvestor?.user
              ? `${output.companyInvestor.user.firstName} ${output.companyInvestor.user.lastName}`
              : undefined),
          investorEmail: output.companyInvestor?.user.email,
          shareClass: output.shareClass,
          numberOfShares: Number(output.numberOfShares),
          hurdleRate: output.hurdleRate ? parseFloat(output.hurdleRate) : undefined,
          originalIssuePriceInUsd: output.originalIssuePriceInUsd
            ? parseFloat(output.originalIssuePriceInUsd)
            : undefined,
          preferredDividendAmountInUsd: parseFloat(output.preferredDividendAmountInUsd),
          dividendAmountInUsd: parseFloat(output.dividendAmountInUsd),
          totalAmountInUsd: parseFloat(output.totalAmountInUsd),
          qualifiedDividendAmountUsd: parseFloat(output.qualifiedDividendAmountUsd),
        }),
      ),
    };
  }),

  generateDividends: companyProcedure
    .input(
      z.object({
        computationId: z.string(),
        releaseDocument: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.companyAdministrator) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // First, get the computation
      const computation = await db.query.dividendComputations.findFirst({
        where: and(
          eq(dividendComputations.companyId, ctx.company.id),
          eq(dividendComputations.externalId, input.computationId),
        ),
        with: {
          outputs: {
            where: isNotNull(dividendComputationOutputs.companyInvestorId),
          },
        },
      });

      if (!computation) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return await db.transaction(async (tx) => {
        // Create the dividend round
        const [dividendRound] = await tx
          .insert(dividendRounds)
          .values({
            companyId: ctx.company.id,
            issuedAt: new Date(computation.dividendsIssuanceDate),
            numberOfShares: BigInt(computation.outputs.reduce((sum, o) => sum + Number(o.numberOfShares), 0)),
            numberOfShareholders: BigInt(new Set(computation.outputs.map((o) => o.companyInvestorId)).size),
            totalAmountInCents: BigInt(Math.round(parseFloat(computation.totalAmountInUsd) * 100)),
            status: "Pending signup" as const,
            returnOfCapital: computation.returnOfCapital,
            releaseDocument: input.releaseDocument,
          })
          .returning();

        if (!dividendRound) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create dividend round" });
        }

        // Create individual dividends from outputs
        const dividendsToInsert = computation.outputs
          .filter((output) => output.companyInvestorId !== null)
          .map((output) => ({
            companyId: ctx.company.id,
            companyInvestorId: output.companyInvestorId || BigInt(0),
            dividendRoundId: dividendRound.id,
            numberOfShares: output.numberOfShares,
            totalAmountInCents: BigInt(Math.round(parseFloat(output.totalAmountInUsd) * 100)),
            netAmountInCents: BigInt(Math.round(parseFloat(output.totalAmountInUsd) * 100)), // Will be adjusted for tax withholding
            withheldTaxCents: BigInt(0), // Tax withholding to be calculated separately
            qualifiedAmountCents: BigInt(Math.round(parseFloat(output.qualifiedDividendAmountUsd) * 100)),
            status: "Pending signup" as const,
          }));

        const createdDividends = await tx.insert(dividends).values(dividendsToInsert).returning();

        if (!dividendRound) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Dividend round not found after creation" });
        }

        return {
          dividendRoundId: dividendRound.externalId,
          numberOfDividends: createdDividends.length,
          totalAmount: parseFloat(computation.totalAmountInUsd),
        };
      });
    }),
});
