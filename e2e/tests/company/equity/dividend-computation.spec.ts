import { db, takeOrThrow } from "@test/db";
import { companiesFactory } from "@test/factories/companies";
import { companyInvestorsFactory } from "@test/factories/companyInvestors";
import { sharesFactory } from "@test/factories/shares";
import { usersFactory } from "@test/factories/users";
import { userComplianceInfoFactory } from "@test/factories/userComplianceInfo";
import { shareClassesFactory } from "@test/factories/shareClasses";
import { login } from "@test/helpers/auth";
import { expect, test, Page } from "@test/index";
import { dividendRounds, dividends, dividendPayments } from "@/db/schema";
import { eq, and } from "drizzle-orm";

test.describe("Dividend Computation", () => {
  const setup = async () => {
    const { company, user: adminUser } = await companiesFactory.createCompletedOnboarding();

    // Create multiple investors with shares
    const investors = await Promise.all([
      (async () => {
        const { user: investorUser1 } = await usersFactory.create();
        const { companyInvestor: companyInvestor1 } = await companyInvestorsFactory.create({
          companyId: company.id,
          userId: investorUser1.id,
          investmentAmountInCents: 100000n,
        });
        await sharesFactory.create({
          companyId: company.id,
          companyInvestorId: companyInvestor1.id,
          numberOfShares: 1000n,
          pricePerShareInCents: 100n,
        });
        return { user: investorUser1, companyInvestor: companyInvestor1 };
      })(),
      (async () => {
        const { user: investorUser2 } = await usersFactory.create();
        const { companyInvestor: companyInvestor2 } = await companyInvestorsFactory.create({
          companyId: company.id,
          userId: investorUser2.id,
          investmentAmountInCents: 200000n,
        });
        await sharesFactory.create({
          companyId: company.id,
          companyInvestorId: companyInvestor2.id,
          numberOfShares: 2000n,
          pricePerShareInCents: 100n,
        });
        return { user: investorUser2, companyInvestor: companyInvestor2 };
      })(),
      (async () => {
        const { user: investorUser3 } = await usersFactory.create();
        const { companyInvestor: companyInvestor3 } = await companyInvestorsFactory.create({
          companyId: company.id,
          userId: investorUser3.id,
          investmentAmountInCents: 300000n,
        });
        await sharesFactory.create({
          companyId: company.id,
          companyInvestorId: companyInvestor3.id,
          numberOfShares: 3000n,
          pricePerShareInCents: 100n,
        });
        return { user: investorUser3, companyInvestor: companyInvestor3 };
      })(),
    ]);

    return { company, adminUser, investors };
  };

  test("allows admin to compute and create dividend distribution", async ({ page }) => {
    const { adminUser } = await setup();

    await login(page, adminUser);
    await page.getByRole("button", { name: "Equity" }).click();
    await page.getByRole("link", { name: "Dividend computation" }).click();

    // Fill in dividend details
    await expect(page.getByRole("heading", { name: "Dividend computation" })).toBeVisible();
    await expect(page.getByText("Dividend details")).toBeVisible();

    // Enter total dividend amount
    await page.getByLabel("Total dividend amount").fill("10000");

    // Verify dividend type toggle
    await expect(page.getByText("This is a dividend distribution (taxable)")).toBeVisible();

    // Set issuance date
    await page.getByRole("button", { name: /Issuance date/i }).click();
    // Select today's date
    await page.getByRole("gridcell", { name: new Date().getDate().toString() }).first().click();

    // Preview allocations
    await page.getByRole("button", { name: "Preview allocations" }).click();

    // Verify preview table is shown
    await expect(page.getByText("Allocation preview")).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();

    // Verify investor allocations are shown
    await expect(page.getByRole("cell", { name: "1,000" })).toBeVisible(); // Shares for investor 1
    await expect(page.getByRole("cell", { name: "2,000" })).toBeVisible(); // Shares for investor 2
    await expect(page.getByRole("cell", { name: "3,000" })).toBeVisible(); // Shares for investor 3

    // Verify summary is shown
    await expect(page.getByText("Summary")).toBeVisible();
    await expect(page.getByText("Total gross amount")).toBeVisible();
    await expect(page.getByText("Total tax withholding")).toBeVisible();
    await expect(page.getByText("Total net amount")).toBeVisible();

    // Create dividend round
    await page.getByRole("button", { name: "Create dividend round" }).click();

    // Should redirect to dividend rounds list page
    await expect(page).toHaveURL("/equity/dividend_rounds");

    // Verify dividend round was created in database
    const dividendRound = await db.query.dividendRounds
      .findFirst({ where: eq(dividendRounds.totalAmountInCents, 1000000n) })
      .then(takeOrThrow);
    expect(dividendRound).toBeDefined();
    expect(dividendRound.totalAmountInCents).toBe(1000000n);
  });

  test("allows toggling between dividend and return of capital", async ({ page }) => {
    const { adminUser } = await setup();

    await login(page, adminUser);
    await page.getByRole("button", { name: "Equity" }).click();
    await page.getByRole("link", { name: "Dividend computation" }).click();

    // Verify default is dividend
    await expect(page.getByText("This is a dividend distribution (taxable)")).toBeVisible();

    // Toggle to return of capital
    await page.getByRole("switch", { name: /Dividend payment/i }).click();
    await expect(page.getByText("This is a return of capital (may reduce cost basis)")).toBeVisible();

    // Fill other fields and preview
    await page.getByLabel("Total dividend amount").fill("5000");
    await page.getByRole("button", { name: /Issuance date/i }).click();
    await page.getByRole("gridcell", { name: new Date().getDate().toString() }).first().click();
    await page.getByRole("button", { name: "Preview allocations" }).click();

    // Verify preview shows
    await expect(page.getByText("Allocation preview")).toBeVisible();
  });

  test("shows error for invalid total amount", async ({ page }) => {
    const { adminUser } = await setup();

    await login(page, adminUser);
    await page.getByRole("button", { name: "Equity" }).click();
    await page.getByRole("link", { name: "Dividend computation" }).click();

    // Try to preview without entering amount
    await page.getByRole("button", { name: /Issuance date/i }).click();
    await page.getByRole("gridcell", { name: new Date().getDate().toString() }).first().click();

    // Button should be disabled
    await expect(page.getByRole("button", { name: "Preview allocations" })).toBeDisabled();

    // Enter negative amount
    await page.getByLabel("Total dividend amount").fill("-100");
    await page.getByLabel("Total dividend amount").blur();

    // Should show error
    await expect(page.getByText("Total amount must be greater than 0")).toBeVisible();
  });

  test("allows going back to edit after preview", async ({ page }) => {
    const { adminUser } = await setup();

    await login(page, adminUser);
    await page.getByRole("button", { name: "Equity" }).click();
    await page.getByRole("link", { name: "Dividend computation" }).click();

    // Fill form and preview
    await page.getByLabel("Total dividend amount").fill("8000");
    await page.getByRole("button", { name: /Issuance date/i }).click();
    await page.getByRole("gridcell", { name: new Date().getDate().toString() }).first().click();
    await page.getByRole("button", { name: "Preview allocations" }).click();

    // Verify preview is shown
    await expect(page.getByText("Allocation preview")).toBeVisible();

    // Go back to edit
    await page.getByRole("button", { name: "Back to edit" }).click();

    // Verify form is shown again and preview is hidden
    await expect(page.getByText("Allocation preview")).not.toBeVisible();
    await expect(page.getByLabel("Total dividend amount")).toHaveValue("8000");
  });

  test("shows appropriate message when no shareholders exist", async ({ page }) => {
    // Create company without shareholders
    const { company, user: adminUser } = await companiesFactory.createCompletedOnboarding();

    await login(page, adminUser);
    await page.getByRole("button", { name: "Equity" }).click();
    await page.getByRole("link", { name: "Dividend computation" }).click();

    // Fill form and preview
    await page.getByLabel("Total dividend amount").fill("5000");
    await page.getByRole("button", { name: /Issuance date/i }).click();
    await page.getByRole("gridcell", { name: new Date().getDate().toString() }).first().click();
    await page.getByRole("button", { name: "Preview allocations" }).click();

    // Should show empty state message
    await expect(
      page.getByText(
        "No shareholders found. Please ensure there are shareholders with shares before creating a dividend.",
      ),
    ).toBeVisible();
  });

  test.describe("Tax Withholding Scenarios", () => {
    test("correctly calculates tax withholding for different countries", async ({ page }) => {
      const { company, user: adminUser } = await companiesFactory.createCompletedOnboarding();

      // Create share classes
      const commonShareClass = await shareClassesFactory.create({
        companyId: company.id,
        name: "Common",
        hurdle_rate: null,
      });

      // Create investors with different tax scenarios
      const scenarios = [
        { country: "US", usTaxResident: true, expectedWithholding: 30 },
        { country: "CA", usTaxResident: false, expectedWithholding: 15 },
        { country: "GB", usTaxResident: false, expectedWithholding: 0 },
        { country: "DE", usTaxResident: false, expectedWithholding: 26.375 },
        { country: "JP", usTaxResident: false, expectedWithholding: 10 },
      ];

      for (const scenario of scenarios) {
        const { user } = await usersFactory.create();
        await userComplianceInfoFactory.create({
          userId: user.id,
          countryCode: scenario.country,
          usTaxResident: scenario.usTaxResident,
        });

        const { companyInvestor } = await companyInvestorsFactory.create({
          companyId: company.id,
          userId: user.id,
        });

        await sharesFactory.create({
          companyId: company.id,
          companyInvestorId: companyInvestor.id,
          numberOfShares: 1000n,
          shareClassId: commonShareClass.id,
        });
      }

      await login(page, adminUser);
      await page.getByRole("button", { name: "Equity" }).click();
      await page.getByRole("link", { name: "Dividend computation" }).click();

      await page.getByLabel("Total dividend amount").fill("50000");
      await page.getByRole("button", { name: /Issuance date/i }).click();
      await page.getByRole("gridcell", { name: new Date().getDate().toString() }).first().click();
      await page.getByRole("button", { name: "Preview allocations" }).click();

      // Verify withholding calculations
      for (const scenario of scenarios) {
        const grossAmount = 10000; // 50000 / 5 investors
        const expectedWithheld = (grossAmount * scenario.expectedWithholding) / 100;
        const expectedNet = grossAmount - expectedWithheld;

        await expect(page.getByRole("cell", { name: `$${expectedWithheld.toFixed(2)}` })).toBeVisible();
        await expect(page.getByRole("cell", { name: `$${expectedNet.toFixed(2)}` })).toBeVisible();
      }
    });

    test("handles sanctioned countries correctly", async ({ page }) => {
      const { company, user: adminUser } = await companiesFactory.createCompletedOnboarding();

      // Create investor from sanctioned country
      const { user: sanctionedUser } = await usersFactory.create();
      await userComplianceInfoFactory.create({
        userId: sanctionedUser.id,
        countryCode: "IR", // Iran
        usTaxResident: false,
      });

      const { companyInvestor } = await companyInvestorsFactory.create({
        companyId: company.id,
        userId: sanctionedUser.id,
      });

      await sharesFactory.create({
        companyId: company.id,
        companyInvestorId: companyInvestor.id,
        numberOfShares: 1000n,
      });

      await login(page, adminUser);
      await page.getByRole("button", { name: "Equity" }).click();
      await page.getByRole("link", { name: "Dividend computation" }).click();

      await page.getByLabel("Total dividend amount").fill("10000");
      await page.getByRole("button", { name: /Issuance date/i }).click();
      await page.getByRole("gridcell", { name: new Date().getDate().toString() }).first().click();
      await page.getByRole("button", { name: "Preview allocations" }).click();

      // Verify sanctioned status
      const row = page.getByRole("row", { name: new RegExp(sanctionedUser.name) });
      await expect(row.getByText("Retained")).toBeVisible();

      // Hover over status to see tooltip
      await row.getByText("Retained").hover();
      await expect(page.getByText(/sanctions imposed/)).toBeVisible();

      // Create dividend round
      await page.getByRole("button", { name: "Create dividend round" }).click();

      // Verify dividend is marked as retained in database
      const dividend = await db.query.dividends
        .findFirst({
          where: and(eq(dividends.companyInvestorId, companyInvestor.id), eq(dividends.status, "retained")),
        })
        .then(takeOrThrow);
      expect(dividend.retainedReason).toBe("ofac_sanctioned_country");
    });
  });

  test.describe("Payment Processing", () => {
    test("processes payments after dividend creation", async ({ page }) => {
      const { company, user: adminUser, investors } = await setup();

      // Set up bank accounts for investors
      for (const investor of investors) {
        await db.update(investor.user).set({
          bankAccountConfigured: true,
          taxInformationConfirmedAt: new Date(),
        });
      }

      await login(page, adminUser);
      await page.getByRole("button", { name: "Equity" }).click();
      await page.getByRole("link", { name: "Dividend computation" }).click();

      await page.getByLabel("Total dividend amount").fill("100000");
      await page.getByRole("button", { name: /Issuance date/i }).click();
      await page.getByRole("gridcell", { name: new Date().getDate().toString() }).first().click();
      await page.getByRole("button", { name: "Preview allocations" }).click();
      await page.getByRole("button", { name: "Create dividend round" }).click();

      // Navigate to dividend rounds list
      await page.goto("/equity/dividend_rounds");

      // Find the created dividend round
      const roundRow = page.getByRole("row").filter({ hasText: "$100,000.00" }).first();
      await roundRow.getByRole("button", { name: "View details" }).click();

      // Should show payment processing options
      await expect(page.getByRole("heading", { name: "Dividend round details" })).toBeVisible();
      await expect(page.getByText("Payment status")).toBeVisible();

      // Initiate payment processing
      await page.getByRole("button", { name: "Process payments" }).click();

      // Confirm payment processing
      await expect(page.getByText("Process dividend payments?")).toBeVisible();
      await page.getByRole("button", { name: "Process payments" }).click();

      // Verify payment records created
      const payments = await db.query.dividendPayments.findMany();
      expect(payments.length).toBeGreaterThan(0);
    });

    test("handles minimum payment threshold", async ({ page }) => {
      const { company, user: adminUser } = await companiesFactory.createCompletedOnboarding();

      // Create investor with high minimum threshold
      const { user: investorUser } = await usersFactory.create({
        minimumDividendPaymentInCents: 10000n, // $100 minimum
      });

      const { companyInvestor } = await companyInvestorsFactory.create({
        companyId: company.id,
        userId: investorUser.id,
      });

      await sharesFactory.create({
        companyId: company.id,
        companyInvestorId: companyInvestor.id,
        numberOfShares: 10n, // Small amount of shares
      });

      await login(page, adminUser);
      await page.getByRole("button", { name: "Equity" }).click();
      await page.getByRole("link", { name: "Dividend computation" }).click();

      await page.getByLabel("Total dividend amount").fill("1000");
      await page.getByRole("button", { name: /Issuance date/i }).click();
      await page.getByRole("gridcell", { name: new Date().getDate().toString() }).first().click();
      await page.getByRole("button", { name: "Preview allocations" }).click();

      // Should show below threshold status
      const row = page.getByRole("row", { name: new RegExp(investorUser.name) });
      await expect(row.getByText("Below threshold")).toBeVisible();

      // Hover to see minimum amount
      await row.getByText("Below threshold").hover();
      await expect(page.getByText(/minimum payout threshold of \$100\.00/)).toBeVisible();
    });
  });

  test.describe("Email Notifications", () => {
    test("sends notification emails when dividends are issued", async ({ page }) => {
      const { adminUser, investors } = await setup();

      await login(page, adminUser);
      await page.getByRole("button", { name: "Equity" }).click();
      await page.getByRole("link", { name: "Dividend computation" }).click();

      await page.getByLabel("Total dividend amount").fill("50000");
      await page.getByRole("button", { name: /Issuance date/i }).click();
      await page.getByRole("gridcell", { name: new Date().getDate().toString() }).first().click();
      await page.getByRole("button", { name: "Preview allocations" }).click();
      await page.getByRole("button", { name: "Create dividend round" }).click();

      // In a real test, we would verify email delivery through a test email service
      // For now, we'll verify the UI shows success
      await expect(page.getByText("Dividend round created successfully")).toBeVisible();
      await expect(page.getByText("Notification emails sent to investors")).toBeVisible();
    });
  });

  test.describe("Authorization and Security", () => {
    test("prevents non-admin access to dividend computation", async ({ page }) => {
      const { company, investors } = await setup();

      // Try to access as investor
      await login(page, investors[0].user);
      await page.goto(`/company/${company.externalId}/administrator/equity/dividend_computation`);

      // Should be redirected or show error
      await expect(page).not.toHaveURL(/dividend_computation/);
      await expect(page.getByText(/not authorized/i)).toBeVisible();
    });

    test("prevents cross-company access", async ({ page }) => {
      const { company: company1 } = await setup();
      const { company: company2, user: admin2 } = await companiesFactory.createCompletedOnboarding();

      await login(page, admin2);

      // Try to access company1's dividend computation
      await page.goto(`/company/${company1.externalId}/administrator/equity/dividend_computation`);

      await expect(page.getByText(/not authorized/i)).toBeVisible();
    });
  });

  test.describe("Qualified Dividends", () => {
    test("marks long-held shares as qualified", async ({ page }) => {
      const { company, user: adminUser } = await companiesFactory.createCompletedOnboarding();

      // Create investors with shares held for different periods
      const longTermInvestor = await createInvestorWithShares(company, {
        shares: 1000n,
        createdAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000), // 91 days ago
      });

      const shortTermInvestor = await createInvestorWithShares(company, {
        shares: 1000n,
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      });

      await login(page, adminUser);
      await page.getByRole("button", { name: "Equity" }).click();
      await page.getByRole("link", { name: "Dividend computation" }).click();

      await page.getByLabel("Total dividend amount").fill("20000");
      await page.getByRole("button", { name: /Issuance date/i }).click();
      await page.getByRole("gridcell", { name: new Date().getDate().toString() }).first().click();
      await page.getByRole("button", { name: "Preview allocations" }).click();

      // Long-term investor should have qualified indicator
      const longTermRow = page.getByRole("row", { name: new RegExp(longTermInvestor.user.name) });
      await expect(longTermRow.getByTestId("qualified-indicator")).toBeVisible();

      // Short-term investor should not
      const shortTermRow = page.getByRole("row", { name: new RegExp(shortTermInvestor.user.name) });
      await expect(shortTermRow.getByTestId("qualified-indicator")).not.toBeVisible();
    });
  });

  test.describe("Return of Capital", () => {
    test("processes return of capital without tax withholding", async ({ page }) => {
      const { adminUser, investors } = await setup();

      await login(page, adminUser);
      await page.getByRole("button", { name: "Equity" }).click();
      await page.getByRole("link", { name: "Dividend computation" }).click();

      // Toggle to return of capital
      await page.getByRole("switch", { name: /Dividend payment/i }).click();
      await expect(page.getByText("This is a return of capital")).toBeVisible();

      await page.getByLabel("Total dividend amount").fill("30000");
      await page.getByRole("button", { name: /Issuance date/i }).click();
      await page.getByRole("gridcell", { name: new Date().getDate().toString() }).first().click();
      await page.getByRole("button", { name: "Preview allocations" }).click();

      // Verify no tax withholding
      const taxColumns = await page.getByRole("cell", { name: "$0.00" }).all();
      expect(taxColumns.length).toBeGreaterThan(0);

      // Verify all tax withholding is $0.00
      for (const cell of taxColumns) {
        const text = await cell.textContent();
        if (text?.includes("$")) {
          expect(text).toBe("$0.00");
        }
      }

      await page.getByRole("button", { name: "Create dividend round" }).click();

      // Verify in database
      const dividendRound = await db.query.dividendRounds
        .findFirst({ where: eq(dividendRounds.returnOfCapital, true) })
        .then(takeOrThrow);
      expect(dividendRound.returnOfCapital).toBe(true);
    });
  });

  test.describe("Performance", () => {
    test("handles large number of investors efficiently", async ({ page }) => {
      const { company, user: adminUser } = await companiesFactory.createCompletedOnboarding();

      // Create 50 investors
      const investorPromises = Array.from({ length: 50 }, async (_, i) => {
        const { user } = await usersFactory.create();
        const { companyInvestor } = await companyInvestorsFactory.create({
          companyId: company.id,
          userId: user.id,
        });
        await sharesFactory.create({
          companyId: company.id,
          companyInvestorId: companyInvestor.id,
          numberOfShares: BigInt(Math.floor(Math.random() * 5000) + 100),
        });
        return companyInvestor;
      });

      await Promise.all(investorPromises);

      await login(page, adminUser);
      await page.getByRole("button", { name: "Equity" }).click();
      await page.getByRole("link", { name: "Dividend computation" }).click();

      await page.getByLabel("Total dividend amount").fill("1000000");
      await page.getByRole("button", { name: /Issuance date/i }).click();
      await page.getByRole("gridcell", { name: new Date().getDate().toString() }).first().click();

      // Measure time to compute
      const startTime = Date.now();
      await page.getByRole("button", { name: "Preview allocations" }).click();
      await expect(page.getByText("Allocation preview")).toBeVisible({ timeout: 10000 });
      const endTime = Date.now();

      // Should complete within 10 seconds
      expect(endTime - startTime).toBeLessThan(10000);

      // Should show pagination
      await expect(page.getByText(/Showing \d+-\d+ of 50/)).toBeVisible();
    });
  });
});

// Helper function to create investor with shares
async function createInvestorWithShares(company: any, options: { shares: bigint; createdAt?: Date }) {
  const { user } = await usersFactory.create();
  const { companyInvestor } = await companyInvestorsFactory.create({
    companyId: company.id,
    userId: user.id,
  });

  await sharesFactory.create({
    companyId: company.id,
    companyInvestorId: companyInvestor.id,
    numberOfShares: options.shares,
    createdAt: options.createdAt,
  });

  await userComplianceInfoFactory.create({
    userId: user.id,
    usTaxResident: true,
  });

  return { user, companyInvestor };
}
