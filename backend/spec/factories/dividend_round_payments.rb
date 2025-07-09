# frozen_string_literal: true

FactoryBot.define do
  factory :dividend_round_payment do
    dividend_round
    company
    amount_in_cents { 100_000 }
    status { DividendRoundPayment::INITIAL }
    payment_method { "stripe_ach" }
    stripe_payment_intent_id { "pi_#{SecureRandom.hex(12)}" }

    trait :succeeded do
      status { DividendRoundPayment::SUCCEEDED }
      succeeded_at { Time.current }
      stripe_fee_cents { 80 }
    end

    trait :failed do
      status { DividendRoundPayment::FAILED }
      failed_at { Time.current }
      failure_reason { "Insufficient funds" }
    end

    trait :processing do
      status { DividendRoundPayment::PROCESSING }
    end

    trait :cancelled do
      status { DividendRoundPayment::CANCELLED }
      cancelled_at { Time.current }
    end
  end
end