# frozen_string_literal: true

class Internal::Companies::DividendComputationsController < Internal::Companies::BaseController
  before_action :load_dividend_computation!, only: [:show, :generate_dividends]

  def index
    authorize DividendComputation
    dividend_computations = Current.company.dividend_computations.order(created_at: :desc)
    render json: dividend_computations.map { |dc| DividendComputationPresenter.new(dc).props }
  end

  def show
    authorize @dividend_computation
    render json: DividendComputationPresenter.new(@dividend_computation).detailed_props
  end

  def create
    authorize DividendComputation

    result = DividendComputationGeneration.new(
      Current.company,
      amount_in_usd: dividend_computation_params[:amount_in_usd],
      dividends_issuance_date: dividend_computation_params[:dividends_issuance_date],
      return_of_capital: dividend_computation_params[:return_of_capital]
    ).process

    render json: DividendComputationPresenter.new(result).props, status: :created
  rescue ActiveRecord::RecordInvalid => e
    render json: { error: e.message }, status: :unprocessable_entity
  end

  def preview
    authorize DividendComputation

    # Create a temporary computation without saving to database
    service = DividendComputationGeneration.new(
      Current.company,
      amount_in_usd: dividend_computation_params[:amount_in_usd],
      dividends_issuance_date: dividend_computation_params[:dividends_issuance_date],
      return_of_capital: dividend_computation_params[:return_of_capital]
    )

    # Simulate the computation without persisting
    computation = DividendComputation.new(
      company: Current.company,
      total_amount_in_usd: dividend_computation_params[:amount_in_usd],
      dividends_issuance_date: dividend_computation_params[:dividends_issuance_date],
      return_of_capital: dividend_computation_params[:return_of_capital]
    )

    # We need to actually process to get the outputs, but we'll wrap in a transaction and rollback
    ActiveRecord::Base.transaction do
      result = service.process
      render json: DividendComputationPresenter.new(result).detailed_props
      raise ActiveRecord::Rollback
    end
  end

  def generate_dividends
    authorize @dividend_computation

    service = DividendGenerationService.new(@dividend_computation)
    result = service.generate!

    if result[:success]
      dividend_round = result[:dividend_round]
      render json: {
        success: true,
        message: result[:message],
        dividend_round: {
          id: dividend_round.id,
          external_id: dividend_round.external_id,
          issued_at: dividend_round.issued_at,
          total_amount_in_cents: dividend_round.total_amount_in_cents,
          number_of_shareholders: dividend_round.number_of_shareholders,
          number_of_shares: dividend_round.number_of_shares,
          status: dividend_round.status
        },
        summary: result[:summary]
      }
    else
      render json: { success: false, errors: result[:errors] }, status: :unprocessable_entity
    end
  end

  private

  def load_dividend_computation!
    @dividend_computation = Current.company.dividend_computations.find(params[:id])
  end

  def dividend_computation_params
    params.require(:dividend_computation).permit(
      :amount_in_usd,
      :dividends_issuance_date,
      :return_of_capital
    )
  end
end