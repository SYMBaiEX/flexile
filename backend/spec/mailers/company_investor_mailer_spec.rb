# frozen_string_literal: true

RSpec.describe CompanyInvestorMailer do
  describe "#dividend_issued" do
    let(:user) { create(:user) }
    let(:company) { create(:company) }
    let(:company_investor) { create(:company_investor, user: user, company: company, investment_amount_in_cents: 100_000) }
    let!(:dividend1) { create(:dividend, company_investor: company_investor, total_amount_in_cents: 5000, net_amount_in_cents: 4000, withheld_tax_cents: 1000, created_at: 1.year.ago) }
    let!(:dividend2) { create(:dividend, company_investor: company_investor, total_amount_in_cents: 5000, net_amount_in_cents: 4000, withheld_tax_cents: 1000, created_at: Time.current) }
    let!(:investor_dividend_round) { create(:investor_dividend_round, company_investor: company_investor, dividend_round: dividend2.dividend_round) }

    it "sends dividend email with correct attributes" do
      mail = described_class.dividend_issued(investor_dividend_round_id: investor_dividend_round.id)
      plaintext = ActionView::Base.full_sanitizer.sanitize(mail.body.encoded).gsub("\r\n", " ").gsub(/\s+/, " ").strip

      expect(mail.to).to eq([user.email])
      expect(mail.subject).to eq("Upcoming distribution from #{company.name}")
      expect(plaintext).to include("You’re set to receive a $50.00 distribution from your investment in #{company.name}.")
      expect(plaintext).to include("Based on your total investment of $1,000.00, your total return so far is 10.0%.")
      expect(plaintext).to include("We plan to send this payment to your payout method ending in 1234, with $10.00 expected to be withheld for taxes.")
    end

    context "when tax information is missing" do
      let!(:dividend1) { create(:dividend, company_investor: company_investor, total_amount_in_cents: 5000, created_at: 1.year.ago, withheld_tax_cents: nil, net_amount_in_cents: nil) }
      let!(:dividend2) { create(:dividend, company_investor: company_investor, total_amount_in_cents: 5000, created_at: Time.current, withheld_tax_cents: nil, net_amount_in_cents: nil) }
      let!(:investor_dividend_round) { create(:investor_dividend_round, company_investor: company_investor, dividend_round: dividend2.dividend_round) }

      it "calculates tax withholding and net amount" do
        allow_any_instance_of(DividendTaxWithholdingCalculator).to receive(:net_cents).and_return(4000)
        allow_any_instance_of(DividendTaxWithholdingCalculator).to receive(:cents_to_withhold).and_return(1000)

        mail = described_class.dividend_issued(investor_dividend_round_id: investor_dividend_round.id)
        plaintext = ActionView::Base.full_sanitizer.sanitize(mail.body.encoded).gsub("\r\n", " ").gsub(/\s+/, " ").strip

        expect(plaintext).to include("You’re set to receive a $50.00 distribution from your investment in #{company.name}.")
        expect(plaintext).to include("Based on your total investment of $1,000.00, your total return so far is 10.0%.")
        expect(plaintext).to include("We plan to send this payment to your payout method ending in 1234, with $10.00 expected to be withheld for taxes.")
      end
    end

    context "when the user does not have a bank account set up for dividends" do
      let(:user) { create(:user, without_bank_account: true) }

      it "includes a message about setting up a bank account" do
        mail = described_class.dividend_issued(investor_dividend_round_id: investor_dividend_round.id)
        plaintext = ActionView::Base.full_sanitizer.sanitize(mail.body.encoded).gsub("\r\n", " ").gsub(/\s+/, " ").strip

        expect(plaintext).to include("You’re set to receive a $50.00 distribution from your investment in #{company.name}.")
        expect(plaintext).to include("Based on your total investment of $1,000.00, your total return so far is 10.0%.")
        expect(plaintext).to include("You currently do not have a bank account set up for dividends.")
        expect(plaintext).to include("Once set up, we will send this payment to it, with $10.00 expected to be withheld for taxes.")
      end
    end
  end

  describe "#dividend_payment_ready" do
    let(:user) { create(:user) }
    let(:company) { create(:company) }
    let(:company_investor) { create(:company_investor, user: user, company: company, investment_amount_in_cents: 100_000) }
    let!(:dividend1) { create(:dividend, company_investor: company_investor, total_amount_in_cents: 5000, net_amount_in_cents: 4000, withheld_tax_cents: 1000, created_at: 1.year.ago) }
    let!(:dividend2) { create(:dividend, company_investor: company_investor, total_amount_in_cents: 5000, net_amount_in_cents: 4000, withheld_tax_cents: 1000, created_at: Time.current) }
    let!(:investor_dividend_round) { create(:investor_dividend_round, company_investor: company_investor, dividend_round: dividend2.dividend_round) }

    it "sends dividend payment ready email" do
      mail = described_class.dividend_payment_ready(investor_dividend_round_id: investor_dividend_round.id)
      plaintext = ActionView::Base.full_sanitizer.sanitize(mail.body.encoded).gsub("\r\n", " ").gsub(/\s+/, " ").strip

      expect(mail.to).to eq([user.email])
      expect(mail.subject).to eq("Your distribution from #{company.name} is ready")
      expect(plaintext).to include("Your $40.00 distribution from #{company.name} is ready for payment")
      expect(plaintext).to include("This payment will be sent to your bank account ending in 1234")
      expect(plaintext).to include("Processing typically takes 3-5 business days")
    end
  end

  describe "#dividend_payment_completed" do
    let(:user) { create(:user) }
    let(:company) { create(:company) }
    let(:company_investor) { create(:company_investor, user: user, company: company, investment_amount_in_cents: 100_000) }
    let!(:dividend1) { create(:dividend, company_investor: company_investor, total_amount_in_cents: 5000, net_amount_in_cents: 4000, withheld_tax_cents: 1000, created_at: 1.year.ago) }
    let!(:dividend2) { create(:dividend, company_investor: company_investor, total_amount_in_cents: 5000, net_amount_in_cents: 4000, withheld_tax_cents: 1000, created_at: Time.current) }
    let(:dividend_payment) { create(:dividend_payment, dividends: [dividend1, dividend2]) }

    it "sends dividend payment completed email" do
      mail = described_class.dividend_payment_completed(dividend_payment.id)
      plaintext = ActionView::Base.full_sanitizer.sanitize(mail.body.encoded).gsub("\r\n", " ").gsub(/\s+/, " ").strip

      expect(mail.to).to eq([user.email])
      expect(mail.subject).to eq("You've got a distribution from #{company.name}")
      expect(plaintext).to include("You've just been paid a $80.00 distribution from your investment in #{company.name}")
      expect(plaintext).to include("The gross amount was $100.00, with $20.00 withheld for taxes")
    end
  end



end
