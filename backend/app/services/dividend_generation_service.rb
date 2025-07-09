# frozen_string_literal: true

class DividendGenerationService
  attr_reader :dividend_computation, :errors

  def initialize(dividend_computation)
    @dividend_computation = dividend_computation
    @errors = []
  end

  def generate!
    validate_no_existing_round!
    
    ActiveRecord::Base.transaction do
      dividend_round = create_dividend_round!
      dividends = create_dividends!(dividend_round)
      calculate_and_update_tax_withholding!(dividends)
      handle_email_notifications(dividend_round)
      
      { 
        success: true, 
        dividend_round: dividend_round, 
        message: "Dividend round created successfully",
        summary: generate_summary(dividend_round)
      }
    end
  rescue StandardError => e
    @errors << e.message
    { success: false, errors: @errors }
  end

  private

  def validate_no_existing_round!
    existing_round = dividend_computation.company.dividend_rounds.where(
      "issued_at >= ?", dividend_computation.dividends_issuance_date
    ).exists?
    
    if existing_round
      raise StandardError, "A dividend round already exists for this date or later"
    end
  end

  def create_dividend_round!
    data = dividend_computation.dividend_creation_data
    
    dividend_computation.company.dividend_rounds.create!(
      issued_at: dividend_computation.dividends_issuance_date,
      number_of_shares: data.sum { |d| d[:number_of_shares] || 0 },
      number_of_shareholders: data.map { |d| d[:company_investor_id] }.uniq.count,
      status: "Issued",
      total_amount_in_cents: (dividend_computation.total_amount_in_usd * 100).to_i,
      return_of_capital: dividend_computation.return_of_capital,
      ready_for_payment: false
    )
  end

  def create_dividends!(dividend_round)
    data = dividend_computation.dividend_creation_data
    dividends = []
    
    data.each do |dividend_attrs|
      company_investor = dividend_computation.company.company_investors.find(dividend_attrs[:company_investor_id])
      
      # Determine initial status based on investor onboarding state
      status = determine_dividend_status(company_investor)
      
      dividend = company_investor.dividends.create!(
        dividend_round: dividend_round,
        company: dividend_computation.company,
        total_amount_in_cents: (dividend_attrs[:total_amount] * 100).to_i,
        qualified_amount_cents: (dividend_attrs[:qualified_dividends_amount] * 100).to_i,
        number_of_shares: dividend_attrs[:number_of_shares],
        status: status,
        # Initialize withholding fields
        withholding_percentage: nil,
        withheld_tax_cents: nil,
        net_amount_in_cents: nil
      )
      
      dividends << dividend
    end
    
    dividends
  end

  def determine_dividend_status(company_investor)
    # Check if investor has completed onboarding
    if company_investor.completed_onboarding?
      Dividend::ISSUED
    else
      Dividend::PENDING_SIGNUP
    end
  end

  def calculate_and_update_tax_withholding!(dividends)
    # Group dividends by company investor for bulk tax calculation
    dividends_by_investor = dividends.group_by(&:company_investor_id)
    
    dividends_by_investor.each do |company_investor_id, investor_dividends|
      company_investor = dividend_computation.company.company_investors.find(company_investor_id)
      user = company_investor.user
      
      # Skip tax calculation for investors who haven't completed onboarding
      next unless company_investor.completed_onboarding?
      
      # Calculate total amount for this investor to check retention thresholds
      total_amount_cents = investor_dividends.sum(&:total_amount_in_cents)
      
      # Check if dividends should be retained
      if should_retain_dividends?(user, total_amount_cents)
        retain_dividends!(investor_dividends, user, total_amount_cents)
        next
      end
      
      # Calculate tax withholding for this investor
      calculator = DividendTaxWithholdingCalculator.new(
        company_investor,
        tax_year: dividend_computation.dividends_issuance_date.year,
        dividends: investor_dividends
      )
      
      # Update each dividend with withholding info
      investor_dividends.each do |dividend|
        withholding_percentage = calculator.withholding_percentage(dividend)
        withheld_tax_cents = ((withholding_percentage * dividend.total_amount_in_cents) / 100.0).round
        net_amount_in_cents = dividend.total_amount_in_cents - withheld_tax_cents
        
        dividend.update!(
          withholding_percentage: withholding_percentage,
          withheld_tax_cents: withheld_tax_cents,
          net_amount_in_cents: net_amount_in_cents
        )
      end
    end
  end

  def should_retain_dividends?(user, total_amount_cents)
    # Check if user is from sanctioned country
    return true if user.sanctioned_country_resident?
    
    # Check if amount is below minimum threshold
    return true if total_amount_cents < (user.minimum_dividend_payment_in_cents || 0)
    
    false
  end

  def retain_dividends!(dividends, user, total_amount_cents)
    retention_reason = if user.sanctioned_country_resident?
                         Dividend::RETAINED_REASON_COUNTRY_SANCTIONED
                       else
                         Dividend::RETAINED_REASON_BELOW_THRESHOLD
                       end
    
    dividends.each do |dividend|
      dividend.mark_retained!(retention_reason)
      # Set withholding info even for retained dividends for reporting
      dividend.update!(
        withholding_percentage: 0,
        withheld_tax_cents: 0,
        net_amount_in_cents: dividend.total_amount_in_cents
      )
    end
    
    # Send appropriate notification emails
    send_retained_dividend_notifications(dividends, user, total_amount_cents)
  end

  def send_retained_dividend_notifications(dividends, user, total_amount_cents)
    dividend_round = dividends.first.dividend_round
    company_investor = dividends.first.company_investor
    
    investor_dividend_round = company_investor.investor_dividend_rounds.find_or_create_by!(
      dividend_round_id: dividend_round.id
    )
    
    if user.sanctioned_country_resident?
      investor_dividend_round.send_sanctioned_country_email
    else
      investor_dividend_round.send_payout_below_threshold_email
    end
  end

  def handle_email_notifications(dividend_round)
    # Queue email notifications based on investor status
    dividend_round.company.company_investors
      .joins(:dividends)
      .where(dividends: { dividend_round_id: dividend_round.id })
      .distinct
      .find_each do |investor|
        # Create investor dividend round record for tracking emails
        investor_dividend_round = investor.investor_dividend_rounds.find_or_create_by!(
          dividend_round_id: dividend_round.id
        )
        
        # Only send emails to investors who have completed onboarding
        if investor.completed_onboarding?
          # This will be handled by a background job to avoid blocking
          investor_dividend_round.send_dividend_issued_email
        end
      end
  end

  def generate_summary(dividend_round)
    dividends = dividend_round.dividends.includes(:company_investor)
    
    {
      total_dividends: dividends.count,
      total_amount_cents: dividend_round.total_amount_in_cents,
      by_status: dividends.group(:status).count,
      pending_onboarding_count: dividends.where(status: Dividend::PENDING_SIGNUP).count,
      issued_count: dividends.where(status: Dividend::ISSUED).count,
      retained_count: dividends.where(status: Dividend::RETAINED).count,
      retained_sanctioned_count: dividends.where(
        status: Dividend::RETAINED, 
        retained_reason: Dividend::RETAINED_REASON_COUNTRY_SANCTIONED
      ).count,
      retained_below_threshold_count: dividends.where(
        status: Dividend::RETAINED, 
        retained_reason: Dividend::RETAINED_REASON_BELOW_THRESHOLD
      ).count,
      total_withholding_cents: dividends.sum(:withheld_tax_cents),
      total_net_amount_cents: dividends.sum(:net_amount_in_cents),
      total_retained_amount_cents: dividends.where(status: Dividend::RETAINED).sum(:total_amount_in_cents)
    }
  end
end