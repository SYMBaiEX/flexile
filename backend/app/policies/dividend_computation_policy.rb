# frozen_string_literal: true

class DividendComputationPolicy < ApplicationPolicy
  def index?
    company_administrator?
  end

  def show?
    company_administrator?
  end

  def create?
    company_administrator?
  end

  def preview?
    company_administrator?
  end

  def generate_dividends?
    company_administrator? && !record.company.dividend_rounds.where(
      "issued_at >= ?", record.dividends_issuance_date
    ).exists?
  end
end