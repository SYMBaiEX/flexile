# frozen_string_literal: true

class CreateDividendRoundPaymentBalanceTransactions < ActiveRecord::Migration[8.0]
  def change
    create_table :dividend_round_payment_balance_transactions do |t|
      t.references :dividend_round_payment, null: false, foreign_key: true
      t.references :company, null: false, foreign_key: true
      t.string :transaction_type, null: false
      t.integer :amount_cents, null: false
      t.text :description, null: false

      t.timestamps
    end

    add_index :dividend_round_payment_balance_transactions, :transaction_type
    add_index :dividend_round_payment_balance_transactions, :created_at
  end
end