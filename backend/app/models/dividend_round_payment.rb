# frozen_string_literal: true

class DividendRoundPayment < ApplicationRecord
  include Payments::Status

  # Additional status for ACH payments
  PROCESSING = "processing"
  ACTION_REQUIRED = "action_required"
  ALL_STATUSES = DEFAULT_STATUSES + [PROCESSING, ACTION_REQUIRED]

  belongs_to :dividend_round
  belongs_to :company
  has_many :balance_transactions, class_name: "DividendRoundPaymentBalanceTransaction"

  validates :amount_in_cents, numericality: { greater_than: 0, only_integer: true }
  validates :payment_method, presence: true
  validates :stripe_fee_cents, numericality: { greater_than_or_equal_to: 0, only_integer: true }, allow_nil: true
  validates :stripe_payment_intent_id, uniqueness: true, allow_nil: true

  scope :processing, -> { where(status: PROCESSING) }
  scope :requires_action, -> { where(status: ACTION_REQUIRED) }

  def amount_in_dollars
    amount_in_cents / 100.0
  end

  def stripe_fee_in_dollars
    return 0 unless stripe_fee_cents
    stripe_fee_cents / 100.0
  end

  def net_amount_in_cents
    amount_in_cents - (stripe_fee_cents || 0)
  end

  def net_amount_in_dollars
    net_amount_in_cents / 100.0
  end

  def processing?
    status == PROCESSING
  end

  def requires_action?
    status == ACTION_REQUIRED
  end

  def stripe_payment_intent
    return nil unless stripe_payment_intent_id
    Stripe::PaymentIntent.retrieve(stripe_payment_intent_id)
  end
end