# frozen_string_literal: true

# Service for handling Stripe ACH collection from companies to fund dividend payments
# 
# Usage:
#   # When a dividend round is marked ready for payment
#   service = Stripe::DividendPaymentService.new(dividend_round)
#   payment_record = service.create_payment_intent
#   
#   # The service will:
#   # 1. Create a Stripe payment intent for ACH collection
#   # 2. Handle webhook callbacks to update payment status
#   # 3. Trigger PayAllDividendsJob when funds are collected
#   # 4. Send failure notifications to company admins if needed
#
class Stripe::DividendPaymentService
  class DividendPaymentError < StandardError; end

  attr_reader :dividend_round, :company

  def initialize(dividend_round)
    @dividend_round = dividend_round
    @company = dividend_round.company
  end

  # Creates a Stripe payment intent for dividend collection from the company
  def create_payment_intent
    validate_prerequisites!

    # Check if payment intent already exists for this round
    existing_payment = find_existing_payment
    return existing_payment if existing_payment&.stripe_payment_intent_id.present?

    # Create or retrieve payment record
    payment_record = existing_payment || create_payment_record

    # Create Stripe payment intent for ACH collection
    payment_intent = ::Stripe::PaymentIntent.create(
      {
        amount: dividend_round.total_amount_in_cents,
        currency: "usd",
        customer: company_stripe_customer_id,
        payment_method: company_payment_method_id,
        payment_method_types: ["us_bank_account"],
        confirm: true,
        mandate: company_mandate_id,
        description: "Dividend payment for round ##{dividend_round.id}",
        metadata: {
          dividend_round_id: dividend_round.id,
          company_id: company.id,
          payment_type: "dividend_collection"
        },
        idempotency_key: "dividend_round_#{dividend_round.id}_payment"
      }
    )

    # Update payment record with Stripe details
    payment_record.update!(
      stripe_payment_intent_id: payment_intent.id,
      status: map_stripe_status_to_payment_status(payment_intent.status)
    )

    payment_record
  rescue ::Stripe::StripeError => e
    handle_stripe_error(e, payment_record)
  end

  # Process webhook callback from Stripe
  def process_webhook(stripe_event)
    payment_intent = stripe_event.data.object
    
    # Find the associated payment record
    payment_record = find_payment_by_intent_id(payment_intent.id)
    return unless payment_record

    case stripe_event.type
    when "payment_intent.succeeded"
      handle_payment_succeeded(payment_record, payment_intent)
    when "payment_intent.payment_failed"
      handle_payment_failed(payment_record, payment_intent)
    when "payment_intent.canceled"
      handle_payment_canceled(payment_record, payment_intent)
    when "payment_intent.processing"
      handle_payment_processing(payment_record, payment_intent)
    end
  end

  # Update payment status based on Stripe webhook or manual check
  def update_payment_status(payment_record_id)
    payment_record = DividendRoundPayment.find(payment_record_id)
    return unless payment_record.stripe_payment_intent_id

    # Retrieve latest status from Stripe
    payment_intent = ::Stripe::PaymentIntent.retrieve(payment_record.stripe_payment_intent_id)
    
    # Update local status
    new_status = map_stripe_status_to_payment_status(payment_intent.status)
    payment_record.update!(status: new_status) if payment_record.status != new_status

    # Handle success case
    if new_status == DividendRoundPayment::SUCCEEDED && dividend_round.status != "Paid"
      trigger_dividend_payouts
    end

    payment_record
  rescue ::Stripe::StripeError => e
    handle_stripe_error(e, payment_record)
  end

  private

  def validate_prerequisites!
    raise DividendPaymentError, "Company does not have Stripe account set up" unless company_has_stripe_account?
    raise DividendPaymentError, "Dividend round is not ready for payment" unless dividend_round.ready_for_payment
    raise DividendPaymentError, "Dividend round has already been paid" if dividend_round.status == "Paid"
  end

  def company_has_stripe_account?
    company.company_stripe_accounts.alive.ready.exists?
  end

  def company_stripe_account
    @company_stripe_account ||= company.company_stripe_accounts.alive.ready.last
  end

  def company_stripe_customer_id
    # Use the company's existing method to fetch or create Stripe customer
    company.fetch_or_create_stripe_customer_id!
  end

  def company_payment_method_id
    # Get the payment method from the setup intent
    setup_intent = company_stripe_account.stripe_setup_intent
    setup_intent.payment_method
  end

  def company_mandate_id
    # For ACH payments, we need the mandate from the setup intent
    setup_intent = company_stripe_account.stripe_setup_intent
    setup_intent.mandate
  end

  def find_existing_payment
    DividendRoundPayment.find_by(dividend_round: dividend_round)
  end

  def create_payment_record
    DividendRoundPayment.create!(
      dividend_round: dividend_round,
      company: company,
      amount_in_cents: dividend_round.total_amount_in_cents,
      status: DividendRoundPayment::INITIAL,
      payment_method: "stripe_ach"
    )
  end

  def find_payment_by_intent_id(payment_intent_id)
    DividendRoundPayment.find_by(stripe_payment_intent_id: payment_intent_id)
  end

  def map_stripe_status_to_payment_status(stripe_status)
    case stripe_status
    when "succeeded"
      DividendRoundPayment::SUCCEEDED
    when "processing"
      DividendRoundPayment::PROCESSING
    when "canceled"
      DividendRoundPayment::CANCELLED
    when "requires_payment_method", "requires_confirmation", "requires_action"
      DividendRoundPayment::ACTION_REQUIRED
    else
      DividendRoundPayment::FAILED
    end
  end

  def handle_payment_succeeded(payment_record, payment_intent)
    ActiveRecord::Base.transaction do
      # Update payment record
      payment_record.update!(
        status: DividendRoundPayment::SUCCEEDED,
        succeeded_at: Time.current,
        stripe_fee_cents: calculate_stripe_fee(payment_intent)
      )

      # Create balance transaction
      company.balance_transactions.create!(
        transaction_type: BalanceTransaction::DIVIDEND_COLLECTION,
        amount_cents: payment_intent.amount,
        description: "Dividend collection for round ##{dividend_round.id}"
      )

      # Update dividend round status
      dividend_round.update!(status: "Paid", paid_at: Time.current)

      # Trigger dividend payouts to investors
      trigger_dividend_payouts
    end
  end

  def handle_payment_failed(payment_record, payment_intent)
    payment_record.update!(
      status: DividendRoundPayment::FAILED,
      failed_at: Time.current,
      failure_reason: payment_intent.last_payment_error&.message
    )

    # Notify company administrators
    notify_payment_failure(payment_record)
  end

  def handle_payment_canceled(payment_record, payment_intent)
    payment_record.update!(
      status: DividendRoundPayment::CANCELLED,
      cancelled_at: Time.current
    )
  end

  def handle_payment_processing(payment_record, payment_intent)
    payment_record.update!(status: DividendRoundPayment::PROCESSING)
  end

  def calculate_stripe_fee(payment_intent)
    # ACH payments typically have a flat fee of $0.80 per transaction
    # This should be configured based on your Stripe pricing
    80 # 80 cents in cents
  end

  def trigger_dividend_payouts
    # Trigger the existing job that handles individual dividend payments
    PayAllDividendsJob.perform_async
  end

  def notify_payment_failure(payment_record)
    company.company_administrators.each do |admin|
      CompanyMailer.dividend_payment_failed(
        admin_id: admin.id,
        dividend_round_id: dividend_round.id,
        failure_reason: payment_record.failure_reason
      ).deliver_later
    end
  end

  def handle_stripe_error(error, payment_record = nil)
    Rails.logger.error "Stripe error for dividend payment: #{error.message}"
    Bugsnag.notify(error, {
      dividend_round_id: dividend_round.id,
      company_id: company.id,
      payment_record_id: payment_record&.id
    })

    if payment_record
      payment_record.update!(
        status: DividendRoundPayment::FAILED,
        failure_reason: error.message
      )
    end

    raise DividendPaymentError, "Stripe error: #{error.message}"
  end
end