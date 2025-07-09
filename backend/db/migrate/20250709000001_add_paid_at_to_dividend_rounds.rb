# frozen_string_literal: true

class AddPaidAtToDividendRounds < ActiveRecord::Migration[8.0]
  def change
    add_column :dividend_rounds, :paid_at, :datetime
    add_index :dividend_rounds, :paid_at
  end
end