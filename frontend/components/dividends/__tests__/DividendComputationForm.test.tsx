import { render, screen, fireEvent as _fireEvent, waitFor as _waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DividendComputationForm } from "../DividendComputationForm";

// Mock the tRPC hooks
const mockApi = {
  api: {
    dividends: {
      computePreview: {
        useMutation: jest.fn(() => ({
          mutate: jest.fn(),
          isLoading: false,
          error: null,
        })),
      },
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

// Mock the date picker
jest.mock("@/components/ui/DatePicker", () => ({
  DatePicker: ({ onDateChange, placeholder }: { onDateChange?: (date: Date) => void; placeholder?: string }) => (
    <input
      data-testid="date-picker"
      placeholder={placeholder}
      onChange={(e) => onDateChange && onDateChange(new Date(e.target.value))}
    />
  ),
}));

describe("DividendComputationForm", () => {
  const mockProps = {
    companyId: "test-company-id",
    onSuccess: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the form with initial state", () => {
    render(<DividendComputationForm {...mockProps} />);

    expect(screen.getByRole("heading", { name: "Dividend computation" })).toBeInTheDocument();
    expect(screen.getByText("Dividend details")).toBeInTheDocument();
    expect(screen.getByLabelText("Total dividend amount")).toBeInTheDocument();
    expect(screen.getByText("This is a dividend distribution (taxable)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview allocations" })).toBeDisabled();
  });

  it("enables preview button when form is valid", async () => {
    render(<DividendComputationForm {...mockProps} />);

    const user = userEvent.setup();

    // Fill in amount
    await user.type(screen.getByLabelText("Total dividend amount"), "10000");

    // Set date
    await user.type(screen.getByTestId("date-picker"), "2024-12-31");

    // Preview button should be enabled
    expect(screen.getByRole("button", { name: "Preview allocations" })).not.toBeDisabled();
  });

  it("shows validation errors for invalid input", async () => {
    render(<DividendComputationForm {...mockProps} />);

    const user = userEvent.setup();

    // Enter negative amount
    await user.type(screen.getByLabelText("Total dividend amount"), "-100");
    await user.tab(); // Blur the field

    expect(screen.getByText("Total amount must be greater than 0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview allocations" })).toBeDisabled();
  });

  it("shows validation error for zero amount", async () => {
    render(<DividendComputationForm {...mockProps} />);

    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Total dividend amount"), "0");
    await user.tab();

    expect(screen.getByText("Total amount must be greater than 0")).toBeInTheDocument();
  });

  it("toggles between dividend and return of capital", async () => {
    render(<DividendComputationForm {...mockProps} />);

    const user = userEvent.setup();

    // Initially dividend
    expect(screen.getByText("This is a dividend distribution (taxable)")).toBeInTheDocument();

    // Toggle to return of capital
    await user.click(screen.getByRole("switch", { name: /dividend payment/iu }));

    expect(screen.getByText("This is a return of capital (may reduce cost basis)")).toBeInTheDocument();

    // Toggle back
    await user.click(screen.getByRole("switch", { name: /dividend payment/iu }));

    expect(screen.getByText("This is a dividend distribution (taxable)")).toBeInTheDocument();
  });

  it("calls preview mutation when preview button is clicked", async () => {
    const mockMutate = jest.fn();
    const { api } = mockApi;
    api.dividends.computePreview.useMutation.mockReturnValue({
      mutate: mockMutate,
      isLoading: false,
      error: null,
    });

    render(<DividendComputationForm {...mockProps} />);

    const user = userEvent.setup();

    // Fill form
    await user.type(screen.getByLabelText("Total dividend amount"), "50000");
    await user.type(screen.getByTestId("date-picker"), "2024-12-31");

    // Click preview
    await user.click(screen.getByRole("button", { name: "Preview allocations" }));

    expect(mockMutate).toHaveBeenCalledWith({
      companyId: "test-company-id",
      totalAmount: 50000,
      issuanceDate: expect.any(Date),
      returnOfCapital: false,
      description: "",
    });
  });

  it("shows loading state during preview", () => {
    const { api } = mockApi;
    api.dividends.computePreview.useMutation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: true,
      error: null,
    });

    render(<DividendComputationForm {...mockProps} />);

    expect(screen.getByRole("button", { name: "Computing..." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Computing..." })).toBeDisabled();
  });

  it("shows error message when preview fails", () => {
    const { api } = mockApi;
    api.dividends.computePreview.useMutation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: false,
      error: { message: "Failed to compute preview" },
    });

    render(<DividendComputationForm {...mockProps} />);

    expect(screen.getByText("Failed to compute preview")).toBeInTheDocument();
  });

  it("includes description in API call when provided", async () => {
    const mockMutate = jest.fn();
    const { api } = mockApi;
    api.dividends.computePreview.useMutation.mockReturnValue({
      mutate: mockMutate,
      isLoading: false,
      error: null,
    });

    render(<DividendComputationForm {...mockProps} />);

    const user = userEvent.setup();

    // Fill form with description
    await user.type(screen.getByLabelText("Total dividend amount"), "25000");
    await user.type(screen.getByTestId("date-picker"), "2024-12-31");
    await user.type(screen.getByLabelText("Description (optional)"), "Q4 2024 dividend");

    await user.click(screen.getByRole("button", { name: "Preview allocations" }));

    expect(mockMutate).toHaveBeenCalledWith({
      companyId: "test-company-id",
      totalAmount: 25000,
      issuanceDate: expect.any(Date),
      returnOfCapital: false,
      description: "Q4 2024 dividend",
    });
  });

  it("formats amount input correctly", async () => {
    render(<DividendComputationForm {...mockProps} />);

    const user = userEvent.setup();
    const amountInput = screen.getByLabelText("Total dividend amount");

    // Type amount with decimals
    await user.type(amountInput, "12345.67");

    // Should format to currency
    expect(amountInput).toHaveValue("12345.67");
  });

  it("shows required field validation", async () => {
    render(<DividendComputationForm {...mockProps} />);

    const user = userEvent.setup();

    // Try to submit without amount
    await user.type(screen.getByTestId("date-picker"), "2024-12-31");

    expect(screen.getByRole("button", { name: "Preview allocations" })).toBeDisabled();

    // Try to submit without date
    await user.type(screen.getByLabelText("Total dividend amount"), "10000");
    await user.clear(screen.getByTestId("date-picker"));

    expect(screen.getByRole("button", { name: "Preview allocations" })).toBeDisabled();
  });

  it("handles very large amounts", async () => {
    render(<DividendComputationForm {...mockProps} />);

    const user = userEvent.setup();

    // Enter very large amount
    await user.type(screen.getByLabelText("Total dividend amount"), "999999999");
    await user.type(screen.getByTestId("date-picker"), "2024-12-31");

    expect(screen.getByRole("button", { name: "Preview allocations" })).not.toBeDisabled();
  });

  it("handles decimal amounts correctly", async () => {
    render(<DividendComputationForm {...mockProps} />);

    const user = userEvent.setup();

    // Enter decimal amount
    await user.type(screen.getByLabelText("Total dividend amount"), "1234.56");
    await user.type(screen.getByTestId("date-picker"), "2024-12-31");

    expect(screen.getByRole("button", { name: "Preview allocations" })).not.toBeDisabled();
  });
});
