# frozen_string_literal: true

class DividendComputationPresenter
  def initialize(dividend_computation)
    @dividend_computation = dividend_computation
  end

  def props
    {
      id: @dividend_computation.external_id,
      total_amount_in_usd: @dividend_computation.total_amount_in_usd,
      dividends_issuance_date: @dividend_computation.dividends_issuance_date,
      return_of_capital: @dividend_computation.return_of_capital,
      created_at: @dividend_computation.created_at,
      outputs_count: @dividend_computation.dividend_computation_outputs.count
    }
  end

  def detailed_props
    props.merge(
      outputs: @dividend_computation.dividend_computation_outputs.includes(company_investor: :user).map do |output|
        {
          id: output.id,
          investor_name: output.investor_name || output.company_investor&.user&.legal_name,
          company_investor_id: output.company_investor_id,
          share_class: output.share_class,
          number_of_shares: output.number_of_shares,
          hurdle_rate: output.hurdle_rate,
          original_issue_price_in_usd: output.original_issue_price_in_usd,
          dividend_amount_in_usd: output.dividend_amount_in_usd,
          preferred_dividend_amount_in_usd: output.preferred_dividend_amount_in_usd,
          qualified_dividend_amount_usd: output.qualified_dividend_amount_usd,
          total_amount_in_usd: output.total_amount_in_usd
        }
      end,
      summary: {
        total_common_dividend: @dividend_computation.dividend_computation_outputs.sum(:dividend_amount_in_usd),
        total_preferred_dividend: @dividend_computation.dividend_computation_outputs.sum(:preferred_dividend_amount_in_usd),
        total_qualified_dividend: @dividend_computation.dividend_computation_outputs.sum(:qualified_dividend_amount_usd),
        total_investors: @dividend_computation.dividend_computation_outputs.select(:company_investor_id).distinct.count
      }
    )
  end
end