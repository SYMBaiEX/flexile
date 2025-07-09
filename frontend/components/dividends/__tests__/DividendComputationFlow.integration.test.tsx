import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DividendComputationFlow } from "../DividendComputationFlow";

// Mock the tRPC hooks with realistic responses
jest.mock("@/trpc/react", () => ({
  api: {
    dividends: {
      computePreview: {
        useMutation: jest.fn(),
      },
      createRound: {
        useMutation: jest.fn(),
      },
    },
  },
}));

describe("DividendComputationFlow Integration", () => {
  const mockComputePreview = jest.fn();
  const mockCreateRound = jest.fn();

  const mockPreviewResponse = {
    allocations: [
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
        id: "3",
        investorName: "Bob Johnson",
        numberOfShares: 100,
        shareClass: "Common",
        grossAmount: 1666.67,
        taxWithholding: 500.0,
        netAmount: 1166.67,
        status: "below_threshold",
        qualified: false,
        retentionReason: "below_minimum_payment_threshold",
      },
    ],
    summary: {
      totalShares: 1600,
      totalGrossAmount: 26666.67,
      totalTaxWithholding: 8000.0,
      totalNetAmount: 18666.67,
      retainedAmount: 8333.33,
      payableAmount: 11666.67,
      readyCount: 1,
      retainedCount: 1,
      belowThresholdCount: 1,
    },
  };

  const mockProps = {
    companyId: "test-company-id",
    onSuccess: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const { api } = require("@/trpc/react");

    // Setup compute preview mock
    api.dividends.computePreview.useMutation.mockReturnValue({
      mutate: mockComputePreview,
      isLoading: false,
      error: null,
    });

    // Setup create round mock
    api.dividends.createRound.useMutation.mockReturnValue({
      mutate: mockCreateRound,
      isLoading: false,
      error: null,
    });

    // Mock successful preview response
    mockComputePreview.mockImplementation((_, { onSuccess }) => {
      onSuccess(mockPreviewResponse);
    });

    // Mock successful create response
    mockCreateRound.mockImplementation((_, { onSuccess }) => {
      onSuccess({ id: "new-round-id" });
    });
  });

  it("completes the full dividend computation flow", async () => {
    render(<DividendComputationFlow {...mockProps} />);

    const user = userEvent.setup();

    // Step 1: Fill in the form
    expect(screen.getByRole("heading", { name: "Dividend computation" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Total dividend amount"), "25000");
    await user.type(screen.getByTestId("date-picker"), "2024-12-31");
    await user.type(screen.getByLabelText("Description (optional)"), "Year-end dividend");

    // Step 2: Preview allocations
    await user.click(screen.getByRole("button", { name: "Preview allocations" }));

    // Verify API call
    expect(mockComputePreview).toHaveBeenCalledWith({
      companyId: "test-company-id",
      totalAmount: 25000,
      issuanceDate: expect.any(Date),
      returnOfCapital: false,
      description: "Year-end dividend",
    });

    // Step 3: Verify preview shows
    await waitFor(() => {
      expect(screen.getByText("Allocation preview")).toBeInTheDocument();
    });

    // Verify allocations are displayed
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("Jane Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Johnson")).toBeInTheDocument();

    // Verify summary
    expect(screen.getByText("Total shares")).toBeInTheDocument();
    expect(screen.getByText("1,600")).toBeInTheDocument();
    expect(screen.getByText("Total gross amount")).toBeInTheDocument();
    expect(screen.getByText("$26,666.67")).toBeInTheDocument();

    // Step 4: Create dividend round
    await user.click(screen.getByRole("button", { name: "Create dividend round" }));

    // Verify confirmation modal
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Create dividend round?")).toBeInTheDocument();

    // Confirm creation
    await user.click(screen.getByRole("button", { name: "Create dividend round" }));

    // Verify API call
    expect(mockCreateRound).toHaveBeenCalledWith({
      companyId: "test-company-id",
      totalAmount: 26666.67,
      issuanceDate: expect.any(Date),
      returnOfCapital: false,
      description: "Year-end dividend",
      allocations: mockPreviewResponse.allocations,
    });

    // Verify success callback
    expect(mockProps.onSuccess).toHaveBeenCalled();
  });

  it("allows editing after preview", async () => {
    render(<DividendComputationFlow {...mockProps} />);

    const user = userEvent.setup();

    // Fill form and preview
    await user.type(screen.getByLabelText("Total dividend amount"), "20000");
    await user.type(screen.getByTestId("date-picker"), "2024-12-31");
    await user.click(screen.getByRole("button", { name: "Preview allocations" }));

    // Go back to edit
    await waitFor(() => {
      expect(screen.getByText("Allocation preview")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Back to edit" }));

    // Verify form is shown again
    expect(screen.getByLabelText("Total dividend amount")).toHaveValue("20000");
    expect(screen.queryByText("Allocation preview")).not.toBeInTheDocument();

    // Edit the amount
    await user.clear(screen.getByLabelText("Total dividend amount"));
    await user.type(screen.getByLabelText("Total dividend amount"), "30000");

    // Preview again
    await user.click(screen.getByRole("button", { name: "Preview allocations" }));

    // Verify new API call
    expect(mockComputePreview).toHaveBeenCalledWith({
      companyId: "test-company-id",
      totalAmount: 30000,
      issuanceDate: expect.any(Date),
      returnOfCapital: false,
      description: "",
    });
  });

  it("handles return of capital flow", async () => {
    render(<DividendComputationFlow {...mockProps} />);

    const user = userEvent.setup();

    // Toggle to return of capital
    await user.click(screen.getByRole("switch", { name: /dividend payment/i }));
    expect(screen.getByText("This is a return of capital (may reduce cost basis)")).toBeInTheDocument();

    // Fill form
    await user.type(screen.getByLabelText("Total dividend amount"), "15000");
    await user.type(screen.getByTestId("date-picker"), "2024-12-31");

    // Preview
    await user.click(screen.getByRole("button", { name: "Preview allocations" }));

    // Verify API call includes return of capital flag
    expect(mockComputePreview).toHaveBeenCalledWith({
      companyId: "test-company-id",
      totalAmount: 15000,
      issuanceDate: expect.any(Date),
      returnOfCapital: true,
      description: "",
    });
  });

  it("handles loading states correctly", async () => {
    const { api } = require("@/trpc/react");

    // Mock loading state for preview
    api.dividends.computePreview.useMutation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: true,
      error: null,
    });

    render(<DividendComputationFlow {...mockProps} />);

    const user = userEvent.setup();

    // Fill form
    await user.type(screen.getByLabelText("Total dividend amount"), "10000");
    await user.type(screen.getByTestId("date-picker"), "2024-12-31");

    // Button should show loading state
    expect(screen.getByRole("button", { name: "Computing..." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Computing..." })).toBeDisabled();
  });

  it("handles preview errors", async () => {
    const { api } = require("@/trpc/react");

    // Mock error state
    api.dividends.computePreview.useMutation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: false,
      error: { message: "No shareholders found" },
    });

    render(<DividendComputationFlow {...mockProps} />);

    expect(screen.getByText("No shareholders found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview allocations" })).toBeDisabled();
  });

  it("handles creation errors", async () => {
    const { api } = require("@/trpc/react");

    // Mock successful preview but failed creation
    api.dividends.createRound.useMutation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: false,
      error: { message: "Insufficient funds" },
    });

    render(<DividendComputationFlow {...mockProps} />);

    const user = userEvent.setup();

    // Fill form and preview
    await user.type(screen.getByLabelText("Total dividend amount"), "25000");
    await user.type(screen.getByTestId("date-picker"), "2024-12-31");
    await user.click(screen.getByRole("button", { name: "Preview allocations" }));

    await waitFor(() => {
      expect(screen.getByText("Allocation preview")).toBeInTheDocument();
    });

    // Should show error message
    expect(screen.getByText("Insufficient funds")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create dividend round" })).toBeDisabled();
  });

  it("shows detailed status explanations", async () => {
    render(<DividendComputationFlow {...mockProps} />);

    const user = userEvent.setup();

    // Fill form and preview
    await user.type(screen.getByLabelText("Total dividend amount"), "25000");
    await user.type(screen.getByTestId("date-picker"), "2024-12-31");
    await user.click(screen.getByRole("button", { name: "Preview allocations" }));

    await waitFor(() => {
      expect(screen.getByText("Allocation preview")).toBeInTheDocument();
    });

    // Check retained status tooltip
    const retainedButton = screen.getByRole("button", { name: "Retained" });
    await user.hover(retainedButton);
    expect(screen.getByText(/sanctions imposed/)).toBeInTheDocument();

    // Check below threshold status tooltip
    const thresholdButton = screen.getByRole("button", { name: "Below threshold" });
    await user.hover(thresholdButton);
    expect(screen.getByText(/minimum payout threshold/)).toBeInTheDocument();
  });

  it("validates form inputs before allowing preview", async () => {
    render(<DividendComputationFlow {...mockProps} />);

    const user = userEvent.setup();

    // Preview button should be disabled initially
    expect(screen.getByRole("button", { name: "Preview allocations" })).toBeDisabled();

    // Enter invalid amount
    await user.type(screen.getByLabelText("Total dividend amount"), "-100");
    await user.tab();

    expect(screen.getByText("Total amount must be greater than 0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview allocations" })).toBeDisabled();

    // Fix amount but no date
    await user.clear(screen.getByLabelText("Total dividend amount"));
    await user.type(screen.getByLabelText("Total dividend amount"), "10000");

    expect(screen.getByRole("button", { name: "Preview allocations" })).toBeDisabled();

    // Add date
    await user.type(screen.getByTestId("date-picker"), "2024-12-31");

    expect(screen.getByRole("button", { name: "Preview allocations" })).not.toBeDisabled();
  });

  it("handles empty allocations response", async () => {
    // Mock empty response
    mockComputePreview.mockImplementation((_, { onSuccess }) => {
      onSuccess({
        allocations: [],
        summary: {
          totalShares: 0,
          totalGrossAmount: 0,
          totalTaxWithholding: 0,
          totalNetAmount: 0,
          retainedAmount: 0,
          payableAmount: 0,
          readyCount: 0,
          retainedCount: 0,
          belowThresholdCount: 0,
        },
      });
    });

    render(<DividendComputationFlow {...mockProps} />);

    const user = userEvent.setup();

    // Fill form and preview
    await user.type(screen.getByLabelText("Total dividend amount"), "10000");
    await user.type(screen.getByTestId("date-picker"), "2024-12-31");
    await user.click(screen.getByRole("button", { name: "Preview allocations" }));

    await waitFor(() => {
      expect(screen.getByText("No shareholders found")).toBeInTheDocument();
    });

    expect(screen.getByText("There are no shareholders with shares to receive dividends.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create dividend round" })).not.toBeInTheDocument();
  });

  it("filters and sorts allocations in preview", async () => {
    render(<DividendComputationFlow {...mockProps} />);

    const user = userEvent.setup();

    // Fill form and preview
    await user.type(screen.getByLabelText("Total dividend amount"), "25000");
    await user.type(screen.getByTestId("date-picker"), "2024-12-31");
    await user.click(screen.getByRole("button", { name: "Preview allocations" }));

    await waitFor(() => {
      expect(screen.getByText("Allocation preview")).toBeInTheDocument();
    });

    // Filter by status
    await user.click(screen.getByText("Ready (1)"));

    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.queryByText("Jane Smith")).not.toBeInTheDocument();
    expect(screen.queryByText("Bob Johnson")).not.toBeInTheDocument();

    // Clear filter
    await user.click(screen.getByText("All investors"));

    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("Jane Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Johnson")).toBeInTheDocument();
  });
});
