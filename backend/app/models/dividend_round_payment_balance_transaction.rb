# frozen_string_literal: true

class DividendRoundPaymentBalanceTransaction < ApplicationRecord
  belongs_to :dividend_round_payment
  belongs_to :company

  validates :transaction_type, presence: true
  validates :amount_cents, presence: true, numericality: { only_integer: true }
  validates :description, presence: true

  def amount_in_dollars
    amount_cents / 100.0
  end
end