# frozen_string_literal: true

RSpec.describe Stripe::DividendPaymentService do
  let(:company) { create(:company) }
  let(:company_stripe_account) { create(:company_stripe_account, company: company, status: CompanyStripeAccount::READY) }
  let(:dividend_round) { create(:dividend_round, company: company, ready_for_payment: true, status: "Issued") }
  let(:service) { described_class.new(dividend_round) }

  before do
    allow(company).to receive(:company_stripe_accounts).and_return(
      double(alive: double(ready: double(last: company_stripe_account)))
    )
  end

  describe "#create_payment_intent" do
    let(:setup_intent) { double(payment_method: "pm_test123", mandate: "mandate_test123") }
    let(:payment_intent) { double(id: "pi_test123", status: "succeeded") }

    before do
      allow(company).to receive(:fetch_or_create_stripe_customer_id!).and_return("cus_test123")
      allow(company_stripe_account).to receive(:stripe_setup_intent).and_return(setup_intent)
      allow(Stripe::PaymentIntent).to receive(:create).and_return(payment_intent)
    end

    it "creates a Stripe payment intent for ACH collection" do
      expect(Stripe::PaymentIntent).to receive(:create).with(
        hash_including(
          amount: dividend_round.total_amount_in_cents,
          currency: "usd",
          customer: "cus_test123",
          payment_method: "pm_test123",
          payment_method_types: ["us_bank_account"],
          confirm: true,
          mandate: "mandate_test123",
          description: "Dividend payment for round ##{dividend_round.id}",
          metadata: {
            dividend_round_id: dividend_round.id,
            company_id: company.id,
            payment_type: "dividend_collection"
          }
        )
      )

      service.create_payment_intent
    end

    it "creates a DividendRoundPayment record" do
      expect { service.create_payment_intent }.to change(DividendRoundPayment, :count).by(1)

      payment = DividendRoundPayment.last
      expect(payment.dividend_round).to eq(dividend_round)
      expect(payment.company).to eq(company)
      expect(payment.stripe_payment_intent_id).to eq("pi_test123")
      expect(payment.status).to eq(DividendRoundPayment::SUCCEEDED)
    end

    it "returns existing payment if already exists" do
      existing_payment = create(:dividend_round_payment, dividend_round: dividend_round, company: company)
      
      expect(Stripe::PaymentIntent).not_to receive(:create)
      
      result = service.create_payment_intent
      expect(result).to eq(existing_payment)
    end

    context "when Stripe returns an error" do
      before do
        allow(Stripe::PaymentIntent).to receive(:create).and_raise(
          Stripe::StripeError.new("Card declined")
        )
      end

      it "raises a DividendPaymentError" do
        expect { service.create_payment_intent }.to raise_error(
          Stripe::DividendPaymentService::DividendPaymentError,
          /Stripe error: Card declined/
        )
      end
    end
  end

  describe "#process_webhook" do
    let(:payment_record) { create(:dividend_round_payment, dividend_round: dividend_round, company: company) }
    let(:stripe_event) { double(type: "payment_intent.succeeded", data: double(object: payment_intent)) }
    let(:payment_intent) { double(id: payment_record.stripe_payment_intent_id, amount: 100000) }

    before do
      allow(service).to receive(:find_payment_by_intent_id).and_return(payment_record)
    end

    context "when payment succeeds" do
      it "updates payment status and triggers dividend payouts" do
        expect(payment_record).to receive(:update!).with(
          status: DividendRoundPayment::SUCCEEDED,
          succeeded_at: anything,
          stripe_fee_cents: 80
        )
        expect(dividend_round).to receive(:update!).with(status: "Paid", paid_at: anything)
        expect(PayAllDividendsJob).to receive(:perform_async)

        service.process_webhook(stripe_event)
      end
    end

    context "when payment fails" do
      let(:stripe_event) { double(type: "payment_intent.payment_failed", data: double(object: payment_intent)) }
      let(:payment_intent) do
        double(
          id: payment_record.stripe_payment_intent_id,
          last_payment_error: double(message: "Insufficient funds")
        )
      end

      it "updates payment status and notifies admins" do
        expect(payment_record).to receive(:update!).with(
          status: DividendRoundPayment::FAILED,
          failed_at: anything,
          failure_reason: "Insufficient funds"
        )
        expect(CompanyMailer).to receive(:dividend_payment_failed)
          .with(admin_id: anything, dividend_round_id: dividend_round.id, failure_reason: "Insufficient funds")
          .and_return(double(deliver_later: true))

        allow(company).to receive(:company_administrators).and_return([double(id: 1)])
        service.process_webhook(stripe_event)
      end
    end
  end

  describe "#update_payment_status" do
    let(:payment_record) { create(:dividend_round_payment, dividend_round: dividend_round, company: company) }
    let(:payment_intent) { double(status: "succeeded") }

    before do
      allow(Stripe::PaymentIntent).to receive(:retrieve).and_return(payment_intent)
    end

    it "updates payment status from Stripe" do
      expect(payment_record).to receive(:update!).with(status: DividendRoundPayment::SUCCEEDED)
      
      service.update_payment_status(payment_record.id)
    end

    it "triggers dividend payouts when payment succeeds" do
      expect(PayAllDividendsJob).to receive(:perform_async)
      
      service.update_payment_status(payment_record.id)
    end
  end

  describe "validation" do
    context "when company doesn't have Stripe account" do
      before do
        allow(company).to receive(:company_stripe_accounts).and_return(
          double(alive: double(ready: double(exists?: false)))
        )
      end

      it "raises error on payment intent creation" do
        expect { service.create_payment_intent }.to raise_error(
          Stripe::DividendPaymentService::DividendPaymentError,
          /Company does not have Stripe account set up/
        )
      end
    end

    context "when dividend round is not ready for payment" do
      before { dividend_round.update!(ready_for_payment: false) }

      it "raises error on payment intent creation" do
        expect { service.create_payment_intent }.to raise_error(
          Stripe::DividendPaymentService::DividendPaymentError,
          /Dividend round is not ready for payment/
        )
      end
    end

    context "when dividend round is already paid" do
      before { dividend_round.update!(status: "Paid") }

      it "raises error on payment intent creation" do
        expect { service.create_payment_intent }.to raise_error(
          Stripe::DividendPaymentService::DividendPaymentError,
          /Dividend round has already been paid/
        )
      end
    end
  end
end