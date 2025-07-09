import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DividendRoundsList } from "../DividendRoundsList";

// Mock the tRPC hooks
jest.mock("@/trpc/react", () => ({
  api: {
    dividends: {
      getRounds: {
        useQuery: jest.fn(),
      },
      processPayments: {
        useMutation: jest.fn(() => ({
          mutate: jest.fn(),
          isLoading: false,
          error: null,
        })),
      },
    },
  },
}));

// Mock the router
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    refresh: jest.fn(),
  })),
}));

describe("DividendRoundsList", () => {
  const mockRounds = [
    {
      id: "1",
      issuedAt: new Date("2024-12-01"),
      totalAmountInCents: 10000000, // $100,000
      description: "Q4 2024 dividend",
      returnOfCapital: false,
      dividendsCount: 25,
      paidDividendsCount: 20,
      retainedDividendsCount: 3,
      belowThresholdCount: 2,
      totalTaxWithheldCents: 1500000, // $15,000
      totalNetAmountCents: 8500000, // $85,000
      paymentStatus: "pending",
      createdAt: new Date("2024-12-01"),
    },
    {
      id: "2",
      issuedAt: new Date("2024-09-01"),
      totalAmountInCents: 5000000, // $50,000
      description: "Q3 2024 dividend",
      returnOfCapital: false,
      dividendsCount: 15,
      paidDividendsCount: 15,
      retainedDividendsCount: 0,
      belowThresholdCount: 0,
      totalTaxWithheldCents: 750000, // $7,500
      totalNetAmountCents: 4250000, // $42,500
      paymentStatus: "completed",
      createdAt: new Date("2024-09-01"),
    },
    {
      id: "3",
      issuedAt: new Date("2024-06-01"),
      totalAmountInCents: 3000000, // $30,000
      description: "Q2 2024 return of capital",
      returnOfCapital: true,
      dividendsCount: 12,
      paidDividendsCount: 12,
      retainedDividendsCount: 0,
      belowThresholdCount: 0,
      totalTaxWithheldCents: 0,
      totalNetAmountCents: 3000000, // $30,000
      paymentStatus: "completed",
      createdAt: new Date("2024-06-01"),
    },
  ];

  const mockProps = {
    companyId: "test-company-id",
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const { api } = require("@/trpc/react");
    api.dividends.getRounds.useQuery.mockReturnValue({
      data: mockRounds,
      isLoading: false,
      error: null,
    });
  });

  it("renders dividend rounds list", () => {
    render(<DividendRoundsList {...mockProps} />);

    expect(screen.getByRole("heading", { name: "Dividend rounds" })).toBeInTheDocument();
    expect(screen.getByText("Manage dividend distributions and payments")).toBeInTheDocument();

    // Check table headers
    expect(screen.getByRole("columnheader", { name: "Issue date" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Description" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Type" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Amount" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Investors" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Actions" })).toBeInTheDocument();
  });

  it("displays dividend round data correctly", () => {
    render(<DividendRoundsList {...mockProps} />);

    // Check first round (Q4 2024)
    const q4Row = screen.getByRole("row", { name: /Q4 2024 dividend/ });
    within(q4Row).getByText("Dec 1, 2024");
    within(q4Row).getByText("Q4 2024 dividend");
    within(q4Row).getByText("Dividend");
    within(q4Row).getByText("$100,000.00");
    within(q4Row).getByText("25 investors");
    within(q4Row).getByText("Pending");

    // Check second round (Q3 2024)
    const q3Row = screen.getByRole("row", { name: /Q3 2024 dividend/ });
    within(q3Row).getByText("Sep 1, 2024");
    within(q3Row).getByText("Q3 2024 dividend");
    within(q3Row).getByText("Dividend");
    within(q3Row).getByText("$50,000.00");
    within(q3Row).getByText("15 investors");
    within(q3Row).getByText("Completed");

    // Check third round (Return of capital)
    const rocRow = screen.getByRole("row", { name: /return of capital/ });
    within(rocRow).getByText("Jun 1, 2024");
    within(rocRow).getByText("Q2 2024 return of capital");
    within(rocRow).getByText("Return of capital");
    within(rocRow).getByText("$30,000.00");
    within(rocRow).getByText("12 investors");
    within(rocRow).getByText("Completed");
  });

  it("shows loading state", () => {
    const { api } = require("@/trpc/react");
    api.dividends.getRounds.useQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    render(<DividendRoundsList {...mockProps} />);

    expect(screen.getByText("Loading dividend rounds...")).toBeInTheDocument();
  });

  it("shows error state", () => {
    const { api } = require("@/trpc/react");
    api.dividends.getRounds.useQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: "Failed to load dividend rounds" },
    });

    render(<DividendRoundsList {...mockProps} />);

    expect(screen.getByText("Failed to load dividend rounds")).toBeInTheDocument();
  });

  it("shows empty state when no rounds", () => {
    const { api } = require("@/trpc/react");
    api.dividends.getRounds.useQuery.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });

    render(<DividendRoundsList {...mockProps} />);

    expect(screen.getByText("No dividend rounds found")).toBeInTheDocument();
    expect(screen.getByText("Create your first dividend distribution to get started.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create dividend round" })).toBeInTheDocument();
  });

  it("navigates to details when view button is clicked", async () => {
    const mockPush = jest.fn();
    const { useRouter } = require("next/navigation");
    useRouter.mockReturnValue({ push: mockPush, refresh: jest.fn() });

    render(<DividendRoundsList {...mockProps} />);

    const user = userEvent.setup();

    // Click view details button for first round
    const q4Row = screen.getByRole("row", { name: /Q4 2024 dividend/ });
    await user.click(within(q4Row).getByRole("button", { name: "View details" }));

    expect(mockPush).toHaveBeenCalledWith("/company/test-company-id/administrator/equity/dividend_rounds/1");
  });

  it("navigates to create page when create button is clicked", async () => {
    const mockPush = jest.fn();
    const { useRouter } = require("next/navigation");
    useRouter.mockReturnValue({ push: mockPush, refresh: jest.fn() });

    render(<DividendRoundsList {...mockProps} />);

    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Create dividend round" }));

    expect(mockPush).toHaveBeenCalledWith("/company/test-company-id/administrator/equity/dividend_computation");
  });

  it("shows process payments button for pending rounds", () => {
    render(<DividendRoundsList {...mockProps} />);

    const q4Row = screen.getByRole("row", { name: /Q4 2024 dividend/ });
    expect(within(q4Row).getByRole("button", { name: "Process payments" })).toBeInTheDocument();

    const q3Row = screen.getByRole("row", { name: /Q3 2024 dividend/ });
    expect(within(q3Row).queryByRole("button", { name: "Process payments" })).not.toBeInTheDocument();
  });

  it("opens confirmation modal when process payments is clicked", async () => {
    render(<DividendRoundsList {...mockProps} />);

    const user = userEvent.setup();

    const q4Row = screen.getByRole("row", { name: /Q4 2024 dividend/ });
    await user.click(within(q4Row).getByRole("button", { name: "Process payments" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Process dividend payments?")).toBeInTheDocument();
    expect(screen.getByText("This will initiate payments for all eligible investors.")).toBeInTheDocument();
    expect(screen.getByText("20 investors will receive payments")).toBeInTheDocument();
    expect(screen.getByText("Total payout: $85,000.00")).toBeInTheDocument();
  });

  it("processes payments when confirmed", async () => {
    const mockMutate = jest.fn();
    const { api } = require("@/trpc/react");
    api.dividends.processPayments.useMutation.mockReturnValue({
      mutate: mockMutate,
      isLoading: false,
      error: null,
    });

    render(<DividendRoundsList {...mockProps} />);

    const user = userEvent.setup();

    // Open modal
    const q4Row = screen.getByRole("row", { name: /Q4 2024 dividend/ });
    await user.click(within(q4Row).getByRole("button", { name: "Process payments" }));

    // Confirm processing
    await user.click(screen.getByRole("button", { name: "Process payments" }));

    expect(mockMutate).toHaveBeenCalledWith({
      dividendRoundId: "1",
    });
  });

  it("shows payment processing loading state", () => {
    const { api } = require("@/trpc/react");
    api.dividends.processPayments.useMutation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: true,
      error: null,
    });

    render(<DividendRoundsList {...mockProps} />);

    const q4Row = screen.getByRole("row", { name: /Q4 2024 dividend/ });
    expect(within(q4Row).getByText("Processing...")).toBeInTheDocument();
  });

  it("filters rounds by type", async () => {
    render(<DividendRoundsList {...mockProps} />);

    const user = userEvent.setup();

    // Should show filter options
    expect(screen.getByText("All types")).toBeInTheDocument();
    expect(screen.getByText("Dividends")).toBeInTheDocument();
    expect(screen.getByText("Return of capital")).toBeInTheDocument();

    // Click on "Return of capital" filter
    await user.click(screen.getByText("Return of capital"));

    // Should only show return of capital rounds
    expect(screen.getByText("Q2 2024 return of capital")).toBeInTheDocument();
    expect(screen.queryByText("Q4 2024 dividend")).not.toBeInTheDocument();
    expect(screen.queryByText("Q3 2024 dividend")).not.toBeInTheDocument();
  });

  it("sorts rounds by different columns", async () => {
    render(<DividendRoundsList {...mockProps} />);

    const user = userEvent.setup();

    // Click on "Amount" header to sort
    await user.click(screen.getByRole("columnheader", { name: "Amount" }));

    // Should sort by amount (descending)
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("Q4 2024 dividend")).toBeInTheDocument(); // Highest amount
    expect(within(rows[3]).getByText("Q2 2024 return of capital")).toBeInTheDocument(); // Lowest amount
  });

  it("shows pagination for large number of rounds", () => {
    const manyRounds = Array.from({ length: 25 }, (_, i) => ({
      id: `${i + 1}`,
      issuedAt: new Date(`2024-${(i % 12) + 1}-01`),
      totalAmountInCents: 1000000 * (i + 1),
      description: `Dividend ${i + 1}`,
      returnOfCapital: false,
      dividendsCount: 10,
      paidDividendsCount: 10,
      retainedDividendsCount: 0,
      belowThresholdCount: 0,
      totalTaxWithheldCents: 150000,
      totalNetAmountCents: 850000,
      paymentStatus: "completed",
      createdAt: new Date(`2024-${(i % 12) + 1}-01`),
    }));

    const { api } = require("@/trpc/react");
    api.dividends.getRounds.useQuery.mockReturnValue({
      data: manyRounds,
      isLoading: false,
      error: null,
    });

    render(<DividendRoundsList {...mockProps} />);

    // Should show pagination
    expect(screen.getByText(/Showing \d+-\d+ of 25/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
  });

  it("shows status badges with correct colors", () => {
    render(<DividendRoundsList {...mockProps} />);

    // Pending status should have orange/yellow styling
    const pendingBadge = screen.getByText("Pending");
    expect(pendingBadge).toHaveClass("bg-yellow-100", "text-yellow-800");

    // Completed status should have green styling
    const completedBadges = screen.getAllByText("Completed");
    completedBadges.forEach((badge) => {
      expect(badge).toHaveClass("bg-green-100", "text-green-800");
    });
  });

  it("shows investor breakdown tooltip", async () => {
    render(<DividendRoundsList {...mockProps} />);

    const user = userEvent.setup();

    // Hover over investor count
    const q4Row = screen.getByRole("row", { name: /Q4 2024 dividend/ });
    await user.hover(within(q4Row).getByText("25 investors"));

    // Should show breakdown
    expect(screen.getByText("20 paid")).toBeInTheDocument();
    expect(screen.getByText("3 retained")).toBeInTheDocument();
    expect(screen.getByText("2 below threshold")).toBeInTheDocument();
  });
});
