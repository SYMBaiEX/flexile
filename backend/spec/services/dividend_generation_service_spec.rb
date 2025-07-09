# frozen_string_literal: true

require "rails_helper"

RSpec.describe DividendGenerationService do
  let(:company) { create(:company) }
  let(:dividend_computation) { create(:dividend_computation, company: company, total_amount_in_usd: 10000, return_of_capital: false) }
  let(:service) { described_class.new(dividend_computation) }

  describe "#generate!" do
    context "when there are no existing dividend rounds" do
      let!(:investor1) { create(:company_investor, company: company) }
      let!(:investor2) { create(:company_investor, company: company) }
      
      before do
        # Create dividend computation outputs
        create(:dividend_computation_output,
               dividend_computation: dividend_computation,
               company_investor: investor1,
               total_amount_in_usd: 6000,
               qualified_dividend_amount_usd: 5000,
               number_of_shares: 100)
        
        create(:dividend_computation_output,
               dividend_computation: dividend_computation,
               company_investor: investor2,
               total_amount_in_usd: 4000,
               qualified_dividend_amount_usd: 3000,
               number_of_shares: 50)
      end

      context "with investors who have completed onboarding" do
        before do
          allow(investor1).to receive(:completed_onboarding?).and_return(true)
          allow(investor2).to receive(:completed_onboarding?).and_return(true)
        end

        it "creates a dividend round successfully" do
          result = service.generate!
          
          expect(result[:success]).to be true
          expect(result[:message]).to eq("Dividend round created successfully")
          expect(result[:dividend_round]).to be_present
          expect(DividendRound.count).to eq(1)
        end

        it "creates dividends for each investor" do
          service.generate!
          
          expect(Dividend.count).to eq(2)
          expect(investor1.dividends.count).to eq(1)
          expect(investor2.dividends.count).to eq(1)
        end

        it "sets correct dividend amounts" do
          service.generate!
          
          dividend1 = investor1.dividends.first
          expect(dividend1.total_amount_in_cents).to eq(600000) # $6000
          expect(dividend1.qualified_amount_cents).to eq(500000) # $5000
          expect(dividend1.number_of_shares).to eq(100)
          
          dividend2 = investor2.dividends.first
          expect(dividend2.total_amount_in_cents).to eq(400000) # $4000
          expect(dividend2.qualified_amount_cents).to eq(300000) # $3000
          expect(dividend2.number_of_shares).to eq(50)
        end

        it "calculates tax withholding" do
          allow_any_instance_of(DividendTaxWithholdingCalculator).to receive(:withholding_percentage).and_return(15)
          
          service.generate!
          
          dividend = investor1.dividends.first
          expect(dividend.withholding_percentage).to eq(15)
          expect(dividend.withheld_tax_cents).to eq(90000) # 15% of $6000
          expect(dividend.net_amount_in_cents).to eq(510000) # $6000 - $900
        end

        it "sends email notifications" do
          expect_any_instance_of(InvestorDividendRound).to receive(:send_dividend_issued_email).twice
          
          service.generate!
        end

        it "returns a summary" do
          result = service.generate!
          
          expect(result[:summary]).to include(
            :total_dividends,
            :total_amount_cents,
            :by_status,
            :pending_onboarding_count,
            :issued_count,
            :retained_count,
            :retained_sanctioned_count,
            :retained_below_threshold_count,
            :total_withholding_cents,
            :total_net_amount_cents,
            :total_retained_amount_cents
          )
        end
      end

      context "with investors who have not completed onboarding" do
        before do
          allow(investor1).to receive(:completed_onboarding?).and_return(false)
          allow(investor2).to receive(:completed_onboarding?).and_return(true)
        end

        it "sets pending signup status for incomplete investors" do
          service.generate!
          
          expect(investor1.dividends.first.status).to eq(Dividend::PENDING_SIGNUP)
          expect(investor2.dividends.first.status).to eq(Dividend::ISSUED)
        end

        it "does not calculate tax withholding for pending investors" do
          service.generate!
          
          dividend1 = investor1.dividends.first
          expect(dividend1.withholding_percentage).to be_nil
          expect(dividend1.withheld_tax_cents).to be_nil
          expect(dividend1.net_amount_in_cents).to be_nil
        end

        it "does not send emails to pending investors" do
          expect_any_instance_of(InvestorDividendRound).to receive(:send_dividend_issued_email).once
          
          service.generate!
        end
      end

      context "with investors from sanctioned countries" do
        before do
          allow(investor1).to receive(:completed_onboarding?).and_return(true)
          allow(investor1.user).to receive(:sanctioned_country_resident?).and_return(true)
          allow(investor2).to receive(:completed_onboarding?).and_return(true)
          allow(investor2.user).to receive(:sanctioned_country_resident?).and_return(false)
        end

        it "retains dividends for sanctioned country investors" do
          service.generate!
          
          expect(investor1.dividends.first.status).to eq(Dividend::RETAINED)
          expect(investor1.dividends.first.retained_reason).to eq(Dividend::RETAINED_REASON_COUNTRY_SANCTIONED)
          expect(investor2.dividends.first.status).to eq(Dividend::ISSUED)
        end

        it "sends sanctioned country email" do
          expect_any_instance_of(InvestorDividendRound).to receive(:send_sanctioned_country_email).once
          expect_any_instance_of(InvestorDividendRound).to receive(:send_dividend_issued_email).once
          
          service.generate!
        end
      end

      context "with investors below minimum payment threshold" do
        before do
          allow(investor1).to receive(:completed_onboarding?).and_return(true)
          allow(investor1.user).to receive(:minimum_dividend_payment_in_cents).and_return(1000000) # $10,000
          allow(investor2).to receive(:completed_onboarding?).and_return(true)
          allow(investor2.user).to receive(:minimum_dividend_payment_in_cents).and_return(0)
        end

        it "retains dividends below minimum threshold" do
          service.generate!
          
          expect(investor1.dividends.first.status).to eq(Dividend::RETAINED)
          expect(investor1.dividends.first.retained_reason).to eq(Dividend::RETAINED_REASON_BELOW_THRESHOLD)
          expect(investor2.dividends.first.status).to eq(Dividend::ISSUED)
        end

        it "sends below threshold email" do
          expect_any_instance_of(InvestorDividendRound).to receive(:send_payout_below_threshold_email).once
          expect_any_instance_of(InvestorDividendRound).to receive(:send_dividend_issued_email).once
          
          service.generate!
        end
      end
    end

    context "when there is an existing dividend round" do
      before do
        create(:dividend_round, company: company, issued_at: dividend_computation.dividends_issuance_date)
      end

      it "returns an error" do
        result = service.generate!
        
        expect(result[:success]).to be false
        expect(result[:errors]).to include("A dividend round already exists for this date or later")
      end

      it "does not create any records" do
        expect { service.generate! }.not_to change { DividendRound.count }
        expect { service.generate! }.not_to change { Dividend.count }
      end
    end

    context "when an error occurs during creation" do
      before do
        allow_any_instance_of(DividendRound).to receive(:save!).and_raise(ActiveRecord::RecordInvalid)
      end

      it "rolls back the transaction" do
        expect { service.generate! }.not_to change { DividendRound.count }
        expect { service.generate! }.not_to change { Dividend.count }
      end

      it "returns an error response" do
        result = service.generate!
        
        expect(result[:success]).to be false
        expect(result[:errors]).to be_present
      end
    end
  end
end