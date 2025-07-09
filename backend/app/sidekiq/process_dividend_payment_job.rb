# frozen_string_literal: true

class ProcessDividendPaymentJob
  include Sidekiq::Job
  sidekiq_options retry: 3

  def perform(dividend_round_id)
    dividend_round = DividendRound.find(dividend_round_id)
    service = Stripe::DividendPaymentService.new(dividend_round)
    
    # Create the payment intent
    payment_record = service.create_payment_intent

    Rails.logger.info "Created dividend payment intent for round #{dividend_round_id}: #{payment_record.id}"
  rescue => e
    Rails.logger.error "Failed to process dividend payment for round #{dividend_round_id}: #{e.message}"
    Bugsnag.notify(e, { dividend_round_id: dividend_round_id })
    raise e
  end
end