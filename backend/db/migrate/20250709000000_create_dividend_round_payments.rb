# frozen_string_literal: true

class CreateDividendRoundPayments < ActiveRecord::Migration[8.0]
  def change
    create_table :dividend_round_payments do |t|
      t.references :dividend_round, null: false, foreign_key: true
      t.references :company, null: false, foreign_key: true
      t.string :stripe_payment_intent_id
      t.string :status, null: false, default: "initial"
      t.integer :amount_in_cents, null: false
      t.string :payment_method, null: false
      t.integer :stripe_fee_cents
      t.text :failure_reason
      t.datetime :succeeded_at
      t.datetime :failed_at
      t.datetime :cancelled_at

      t.timestamps
    end

    add_index :dividend_round_payments, :stripe_payment_intent_id, unique: true
    add_index :dividend_round_payments, [:dividend_round_id, :company_id], unique: true
    add_index :dividend_round_payments, :status
  end
end