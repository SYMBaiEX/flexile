import { render, screen, fireEvent as _fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DividendAllocationPreview } from "../DividendAllocationPreview";

// Mock the tRPC hooks
const mockApi = {
  api: {
    dividends: {
      createRound: {
        useMutation: jest.fn(() => ({
          mutate: jest.fn(),
          isLoading: false,
          error: null,
        })),
      },
    },
  },
};

jest.mock("@/trpc/react", () => mockApi);

describe("DividendAllocationPreview", () => {
  const mockAllocations = [
    {
      id: "1",
      investorName: "John Doe",
      numberOfShares: 1000,
      shareClass: "Common",
      grossAmount: 16666.67,
      taxWithholding: 5000.0,
      netAmount: 11666.67,
      status: "ready",
      qualified: true,
      retentionReason: null,
    },
    {
      id: "2",
      investorName: "Jane Smith",
      numberOfShares: 2000,
      shareClass: "Series A Preferred",
      grossAmount: 33333.33,
      taxWithholding: 5000.0,
      netAmount: 28333.33,
      status: "ready",
      qualified: false,
      retentionReason: null,
    },
    {
      id: "3",
      investorName: "Bob Johnson",
      numberOfShares: 500,
      shareClass: "Common",
      grossAmount: 8333.33,
      taxWithholding: 2500.0,
      netAmount: 5833.33,
      status: "retained",
      qualified: false,
      retentionReason: "ofac_sanctioned_country",
    },
    {
      id: "4",
      investorName: "Alice Brown",
      numberOfShares: 100,
      shareClass: "Common",
      grossAmount: 1666.67,
      taxWithholding: 500.0,
      netAmount: 1166.67,
      status: "below_threshold",
      qualified: false,
      retentionReason: "below_minimum_payment_threshold",
    },
  ];

  const mockSummary = {
    totalShares: 3600,
    totalGrossAmount: 60000.0,
    totalTaxWithholding: 13000.0,
    totalNetAmount: 47000.0,
    retainedAmount: 10000.0,
    payableAmount: 37000.0,
    readyCount: 2,
    retainedCount: 1,
    belowThresholdCount: 1,
  };

  const mockProps = {
    allocations: mockAllocations,
    summary: mockSummary,
    companyId: "test-company-id",
    issuanceDate: new Date("2024-12-31"),
    returnOfCapital: false,
    description: "Q4 2024 dividend",
    onBack: jest.fn(),
    onSuccess: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the allocation preview table", () => {
    render(<DividendAllocationPreview {...mockProps} />);

    expect(screen.getByRole("heading", { name: "Allocation preview" })).toBeInTheDocument();
    expect(
      screen.getByText("Review the dividend allocations below before creating the dividend round."),
    ).toBeInTheDocument();

    // Check table headers
    expect(screen.getByRole("columnheader", { name: "Investor" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Shares" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Share class" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Gross amount" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Tax withholding" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Net amount" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
  });

  it("displays investor allocations correctly", () => {
    render(<DividendAllocationPreview {...mockProps} />);

    // Check John Doe's row
    const johnRow = screen.getByRole("row", { name: /John Doe/u });
    within(johnRow).getByText("John Doe");
    within(johnRow).getByText("1,000");
    within(johnRow).getByText("Common");
    within(johnRow).getByText("$16,666.67");
    within(johnRow).getByText("$5,000.00");
    within(johnRow).getByText("$11,666.67");
    within(johnRow).getByText("Ready");

    // Check for qualified indicator
    expect(within(johnRow).getByTestId("qualified-indicator")).toBeInTheDocument();

    // Check Jane Smith's row
    const janeRow = screen.getByRole("row", { name: /Jane Smith/u });
    within(janeRow).getByText("Jane Smith");
    within(janeRow).getByText("2,000");
    within(janeRow).getByText("Series A Preferred");
    within(janeRow).getByText("$33,333.33");
    within(janeRow).getByText("$5,000.00");
    within(janeRow).getByText("$28,333.33");
    within(janeRow).getByText("Ready");

    // Should not have qualified indicator
    expect(within(janeRow).queryByTestId("qualified-indicator")).not.toBeInTheDocument();
  });

  it("shows retention status and tooltips", async () => {
    render(<DividendAllocationPreview {...mockProps} />);

    const user = userEvent.setup();

    // Check retained investor
    const bobRow = screen.getByRole("row", { name: /Bob Johnson/u });
    const retainedButton = within(bobRow).getByRole("button", { name: "Retained" });
    expect(retainedButton).toBeInTheDocument();

    // Hover to see tooltip
    await user.hover(retainedButton);
    expect(screen.getByText(/sanctions imposed on.*residence country/u)).toBeInTheDocument();

    // Check below threshold investor
    const aliceRow = screen.getByRole("row", { name: /Alice Brown/u });
    const thresholdButton = within(aliceRow).getByRole("button", { name: "Below threshold" });
    expect(thresholdButton).toBeInTheDocument();

    await user.hover(thresholdButton);
    expect(screen.getByText(/minimum payout threshold/u)).toBeInTheDocument();
  });

  it("displays summary information correctly", () => {
    render(<DividendAllocationPreview {...mockProps} />);

    expect(screen.getByRole("heading", { name: "Summary" })).toBeInTheDocument();

    // Check summary values
    expect(screen.getByText("Total shares")).toBeInTheDocument();
    expect(screen.getByText("3,600")).toBeInTheDocument();

    expect(screen.getByText("Total gross amount")).toBeInTheDocument();
    expect(screen.getByText("$60,000.00")).toBeInTheDocument();

    expect(screen.getByText("Total tax withholding")).toBeInTheDocument();
    expect(screen.getByText("$13,000.00")).toBeInTheDocument();

    expect(screen.getByText("Total net amount")).toBeInTheDocument();
    expect(screen.getByText("$47,000.00")).toBeInTheDocument();

    expect(screen.getByText("Retained amount")).toBeInTheDocument();
    expect(screen.getByText("$10,000.00")).toBeInTheDocument();

    expect(screen.getByText("Amount to be paid")).toBeInTheDocument();
    expect(screen.getByText("$37,000.00")).toBeInTheDocument();
  });

  it("shows return of capital indicator when applicable", () => {
    const returnOfCapitalProps = {
      ...mockProps,
      returnOfCapital: true,
    };

    render(<DividendAllocationPreview {...returnOfCapitalProps} />);

    expect(screen.getByText("This is a return of capital distribution")).toBeInTheDocument();
  });

  it("handles back button click", async () => {
    render(<DividendAllocationPreview {...mockProps} />);

    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Back to edit" }));

    expect(mockProps.onBack).toHaveBeenCalled();
  });

  it("opens confirmation modal on create button click", async () => {
    render(<DividendAllocationPreview {...mockProps} />);

    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Create dividend round" }));

    // Check modal content
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Create dividend round?")).toBeInTheDocument();
    expect(screen.getByText("This will create a dividend round with the following details:")).toBeInTheDocument();
    expect(screen.getByText("2 investors will receive dividends")).toBeInTheDocument();
    expect(screen.getByText("Total amount: $60,000.00")).toBeInTheDocument();
    expect(screen.getByText("Tax withholding: $13,000.00")).toBeInTheDocument();
    expect(screen.getByText("Net payout: $37,000.00")).toBeInTheDocument();
  });

  it("creates dividend round when confirmed", async () => {
    const mockMutate = jest.fn();
    const { api } = mockApi;
    api.dividends.createRound.useMutation.mockReturnValue({
      mutate: mockMutate,
      isLoading: false,
      error: null,
    });

    render(<DividendAllocationPreview {...mockProps} />);

    const user = userEvent.setup();

    // Open modal
    await user.click(screen.getByRole("button", { name: "Create dividend round" }));

    // Confirm creation
    await user.click(screen.getByRole("button", { name: "Create dividend round" }));

    expect(mockMutate).toHaveBeenCalledWith({
      companyId: "test-company-id",
      totalAmount: 60000.0,
      issuanceDate: new Date("2024-12-31"),
      returnOfCapital: false,
      description: "Q4 2024 dividend",
      allocations: mockAllocations,
    });
  });

  it("shows loading state during creation", () => {
    const { api } = mockApi;
    api.dividends.createRound.useMutation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: true,
      error: null,
    });

    render(<DividendAllocationPreview {...mockProps} />);

    expect(screen.getByRole("button", { name: "Creating..." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Creating..." })).toBeDisabled();
  });

  it("shows error message when creation fails", () => {
    const { api } = mockApi;
    api.dividends.createRound.useMutation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: false,
      error: { message: "Failed to create dividend round" },
    });

    render(<DividendAllocationPreview {...mockProps} />);

    expect(screen.getByText("Failed to create dividend round")).toBeInTheDocument();
  });

  it("handles pagination for large number of allocations", () => {
    const manyAllocations = Array.from({ length: 50 }, (_, i) => ({
      id: `${i + 1}`,
      investorName: `Investor ${i + 1}`,
      numberOfShares: 1000,
      shareClass: "Common",
      grossAmount: 1000,
      taxWithholding: 300,
      netAmount: 700,
      status: "ready",
      qualified: false,
      retentionReason: null,
    }));

    const largeSummary = {
      ...mockSummary,
      totalShares: 50000,
      readyCount: 50,
      retainedCount: 0,
      belowThresholdCount: 0,
    };

    render(<DividendAllocationPreview {...mockProps} allocations={manyAllocations} summary={largeSummary} />);

    // Should show pagination
    expect(screen.getByText(/Showing \d+-\d+ of 50/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
  });

  it("filters allocations by status", async () => {
    render(<DividendAllocationPreview {...mockProps} />);

    const user = userEvent.setup();

    // Should show filter options
    expect(screen.getByText("All investors")).toBeInTheDocument();
    expect(screen.getByText("Ready (2)")).toBeInTheDocument();
    expect(screen.getByText("Retained (1)")).toBeInTheDocument();
    expect(screen.getByText("Below threshold (1)")).toBeInTheDocument();

    // Click on "Ready" filter
    await user.click(screen.getByText("Ready (2)"));

    // Should only show ready investors
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("Jane Smith")).toBeInTheDocument();
    expect(screen.queryByText("Bob Johnson")).not.toBeInTheDocument();
    expect(screen.queryByText("Alice Brown")).not.toBeInTheDocument();
  });

  it("sorts allocations by different columns", async () => {
    render(<DividendAllocationPreview {...mockProps} />);

    const user = userEvent.setup();

    // Click on "Gross amount" header to sort
    await user.click(screen.getByRole("columnheader", { name: "Gross amount" }));

    // Should sort by gross amount (descending)
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("Jane Smith")).toBeInTheDocument(); // Highest amount
    expect(within(rows[4]).getByText("Alice Brown")).toBeInTheDocument(); // Lowest amount
  });

  it("shows empty state when no allocations", () => {
    render(
      <DividendAllocationPreview
        {...mockProps}
        allocations={[]}
        summary={{
          ...mockSummary,
          totalShares: 0,
          readyCount: 0,
          retainedCount: 0,
          belowThresholdCount: 0,
        }}
      />,
    );

    expect(screen.getByText("No shareholders found")).toBeInTheDocument();
    expect(screen.getByText("There are no shareholders with shares to receive dividends.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create dividend round" })).not.toBeInTheDocument();
  });
});
