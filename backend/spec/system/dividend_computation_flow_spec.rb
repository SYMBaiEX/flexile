# frozen_string_literal: true

RSpec.describe "Dividend computation flow", :js do
  let(:company) { create(:company, equity_grants_enabled: true) }
  let(:admin_user) { create(:user, :company_administrator, company:) }
  
  # Create investors with different scenarios
  let!(:investor1) do
    investor = create(:company_investor, company:)
    create(:share_holding, company_investor: investor, number_of_shares: 1000, share_class: common_share_class)
    create(:user_compliance_info, user: investor.user, us_tax_resident: true)
    investor
  end
  
  let!(:investor2) do
    investor = create(:company_investor, company:)
    create(:share_holding, company_investor: investor, number_of_shares: 2000, share_class: common_share_class)
    create(:user_compliance_info, user: investor.user, us_tax_resident: false, country_code: "CA")
    investor
  end
  
  let!(:investor3) do
    investor = create(:company_investor, company:)
    create(:share_holding, company_investor: investor, number_of_shares: 3000, share_class: preferred_share_class)
    create(:user_compliance_info, user: investor.user, us_tax_resident: false, country_code: "GB")
    investor
  end
  
  # Investor with sanctions issue
  let!(:investor4) do
    investor = create(:company_investor, company:)
    create(:share_holding, company_investor: investor, number_of_shares: 500, share_class: common_share_class)
    create(:user_compliance_info, user: investor.user, us_tax_resident: false, country_code: "IR") # Iran
    investor
  end
  
  # Investor below minimum threshold
  let!(:investor5) do
    investor = create(:company_investor, company:)
    investor.user.update!(minimum_dividend_payment_in_cents: 10_000)
    create(:share_holding, company_investor: investor, number_of_shares: 10, share_class: common_share_class)
    create(:user_compliance_info, user: investor.user, us_tax_resident: true)
    investor
  end
  
  let(:common_share_class) { create(:share_class, company:, name: "Common", hurdle_rate: nil) }
  let(:preferred_share_class) { create(:share_class, company:, name: "Series A Preferred", hurdle_rate: 8.0) }

  before do
    sign_in admin_user
  end

  describe "creating a dividend distribution" do
    it "allows admin to compute and preview dividend allocations" do
      visit spa_company_administrator_equity_dividend_computation_path(company.external_id)
      
      # Header
      expect(page).to have_text("Dividend computation")
      expect(page).to have_text("Dividend details")
      
      # Fill in the form
      fill_in "Total dividend amount", with: "100000"
      
      # Verify dividend type toggle
      expect(page).to have_text("This is a dividend distribution (taxable)")
      
      # Set issue date
      find_button(text: /Issuance date/).click
      find_button(text: Date.tomorrow.day.to_s).click
      
      # Add optional description
      fill_in "Description (optional)", with: "Q4 2024 dividend distribution"
      
      # Preview allocations
      click_button "Preview allocations"
      
      # Verify preview shows
      expect(page).to have_text("Allocation preview")
      expect(page).to have_text("Review the dividend allocations below before creating the dividend round.")
      
      # Verify investor allocations with proper calculations
      within("table") do
        # Headers
        expect(page).to have_text("Investor")
        expect(page).to have_text("Shares")
        expect(page).to have_text("Share class")
        expect(page).to have_text("Gross amount")
        expect(page).to have_text("Tax withholding")
        expect(page).to have_text("Net amount")
        expect(page).to have_text("Status")
        
        # Investor 1 - US resident (30% withholding)
        within(:table_row, { "Investor" => investor1.user.full_name }) do
          expect(page).to have_text("1,000")
          expect(page).to have_text("Common")
          expect(page).to have_text("$15,625.00") # 1000/6400 * 100000
          expect(page).to have_text("$4,687.50") # 30% withholding
          expect(page).to have_text("$10,937.50")
          expect(page).to have_text("Ready")
        end
        
        # Investor 2 - Canadian (15% withholding)
        within(:table_row, { "Investor" => investor2.user.full_name }) do
          expect(page).to have_text("2,000")
          expect(page).to have_text("Common")
          expect(page).to have_text("$31,250.00") # 2000/6400 * 100000
          expect(page).to have_text("$4,687.50") # 15% withholding
          expect(page).to have_text("$26,562.50")
          expect(page).to have_text("Ready")
        end
        
        # Investor 3 - UK with preferred shares
        within(:table_row, { "Investor" => investor3.user.full_name }) do
          expect(page).to have_text("3,000")
          expect(page).to have_text("Series A Preferred")
          expect(page).to have_text("$46,875.00") # 3000/6400 * 100000
          expect(page).to have_text("$0.00") # 0% UK withholding
          expect(page).to have_text("$46,875.00")
          expect(page).to have_text("Ready")
        end
        
        # Investor 4 - Sanctioned country
        within(:table_row, { "Investor" => investor4.user.full_name }) do
          expect(page).to have_text("500")
          expect(page).to have_text("Common")
          expect(page).to have_text("$7,812.50")
          expect(page).to have_text("$2,343.75") # 30% withholding
          expect(page).to have_text("$5,468.75")
          expect(page).to have_text("Retained")
          expect(find_button("Retained")).to have_tooltip "This dividend is retained due to sanctions imposed on the investor's residence country."
        end
        
        # Investor 5 - Below threshold
        within(:table_row, { "Investor" => investor5.user.full_name }) do
          expect(page).to have_text("10")
          expect(page).to have_text("Common")
          expect(page).to have_text("$156.25")
          expect(page).to have_text("$46.88")
          expect(page).to have_text("$109.38")
          expect(page).to have_text("Below threshold")
          expect(find_button("Below threshold")).to have_tooltip "This dividend doesn't meet the investor's minimum payout threshold of $100.00."
        end
      end
      
      # Verify summary section
      within(".summary") do
        expect(page).to have_text("Summary")
        expect(page).to have_text("Total shares")
        expect(page).to have_text("6,510")
        expect(page).to have_text("Total gross amount")
        expect(page).to have_text("$100,000.00")
        expect(page).to have_text("Total tax withholding")
        expect(page).to have_text("$11,565.63")
        expect(page).to have_text("Total net amount")
        expect(page).to have_text("$88,434.38")
        expect(page).to have_text("Retained amount")
        expect(page).to have_text("$5,578.13")
        expect(page).to have_text("Amount to be paid")
        expect(page).to have_text("$82,856.25")
      end
      
      # Create dividend round
      click_button "Create dividend round"
      
      # Verify confirmation modal
      within("[role='dialog']") do
        expect(page).to have_text("Create dividend round?")
        expect(page).to have_text("This will create a dividend round with the following details:")
        expect(page).to have_text("5 investors will receive dividends")
        expect(page).to have_text("Total amount: $100,000.00")
        expect(page).to have_text("Tax withholding: $11,565.63")
        expect(page).to have_text("Net payout: $82,856.25")
        
        click_button "Create dividend round"
      end
      
      # Should redirect to dividend rounds listing
      expect(page).to have_current_path(spa_company_administrator_equity_dividend_rounds_path(company.external_id))
      expect(page).to have_text("Dividend round created successfully")
      
      # Verify dividend round was created
      dividend_round = DividendRound.last
      expect(dividend_round.company).to eq(company)
      expect(dividend_round.total_amount_in_cents).to eq(10_000_000)
      expect(dividend_round.description).to eq("Q4 2024 dividend distribution")
      expect(dividend_round.return_of_capital).to eq(false)
      expect(dividend_round.issued_at.to_date).to eq(Date.tomorrow)
      
      # Verify individual dividends were created
      expect(dividend_round.dividends.count).to eq(5)
      
      # Verify emails were sent
      expect(ActionMailer::Base.deliveries.count).to eq(5)
      dividend_emails = ActionMailer::Base.deliveries
      expect(dividend_emails.map(&:to).flatten).to match_array([
        investor1.user.email,
        investor2.user.email,
        investor3.user.email,
        investor4.user.email,
        investor5.user.email
      ])
    end

    it "allows creating a return of capital distribution" do
      visit spa_company_administrator_equity_dividend_computation_path(company.external_id)
      
      fill_in "Total dividend amount", with: "50000"
      
      # Toggle to return of capital
      find("[role='switch']", text: /Dividend payment/).click
      expect(page).to have_text("This is a return of capital (may reduce cost basis)")
      
      # Set issue date
      find_button(text: /Issuance date/).click
      find_button(text: Date.current.day.to_s).click
      
      click_button "Preview allocations"
      
      # Verify no tax withholding for return of capital
      within("table") do
        within(:table_row, { "Investor" => investor1.user.full_name }) do
          expect(page).to have_text("$0.00", count: 1) # Tax withholding column
        end
      end
      
      click_button "Create dividend round"
      
      within("[role='dialog']") do
        expect(page).to have_text("This is a return of capital distribution")
        click_button "Create dividend round"
      end
      
      # Verify return of capital flag
      dividend_round = DividendRound.last
      expect(dividend_round.return_of_capital).to eq(true)
    end

    it "handles validation errors" do
      visit spa_company_administrator_equity_dividend_computation_path(company.external_id)
      
      # Try to preview without amount
      click_button "Preview allocations"
      expect(page).to have_text("Total amount is required")
      
      # Enter invalid amount
      fill_in "Total dividend amount", with: "-100"
      find("body").click # Blur the field
      expect(page).to have_text("Total amount must be greater than 0")
      
      # Enter zero amount
      fill_in "Total dividend amount", with: "0"
      find("body").click # Blur the field
      expect(page).to have_text("Total amount must be greater than 0")
      
      # Fix the amount but don't set date
      fill_in "Total dividend amount", with: "1000"
      click_button "Preview allocations"
      expect(page).to have_text("Issuance date is required")
    end

    it "allows editing after preview" do
      visit spa_company_administrator_equity_dividend_computation_path(company.external_id)
      
      # Initial values
      fill_in "Total dividend amount", with: "50000"
      find_button(text: /Issuance date/).click
      find_button(text: Date.current.day.to_s).click
      
      click_button "Preview allocations"
      
      # Go back to edit
      click_button "Back to edit"
      
      # Change values
      fill_in "Total dividend amount", with: "75000"
      find("[role='switch']", text: /Dividend payment/).click
      
      click_button "Preview allocations"
      
      # Verify updated preview
      within(".summary") do
        expect(page).to have_text("$75,000.00")
        expect(page).to have_text("$0.00") # No tax for return of capital
      end
    end

    it "shows appropriate message when no shareholders exist" do
      # Create company without shareholders
      empty_company = create(:company, equity_grants_enabled: true)
      admin = create(:user, :company_administrator, company: empty_company)
      
      sign_in admin
      visit spa_company_administrator_equity_dividend_computation_path(empty_company.external_id)
      
      fill_in "Total dividend amount", with: "10000"
      find_button(text: /Issuance date/).click
      find_button(text: Date.current.day.to_s).click
      
      click_button "Preview allocations"
      
      expect(page).to have_text("No shareholders found")
      expect(page).to have_text("There are no shareholders with shares to receive dividends.")
      expect(page).not_to have_button("Create dividend round")
    end

    it "handles qualified dividend calculations for long-held shares" do
      # Create investor with shares held > 60 days
      qualified_investor = create(:company_investor, company:)
      create(:share_holding, 
        company_investor: qualified_investor,
        number_of_shares: 1000,
        share_class: common_share_class,
        created_at: 90.days.ago
      )
      create(:user_compliance_info, user: qualified_investor.user, us_tax_resident: true)
      
      visit spa_company_administrator_equity_dividend_computation_path(company.external_id)
      
      fill_in "Total dividend amount", with: "10000"
      find_button(text: /Issuance date/).click
      find_button(text: Date.current.day.to_s).click
      
      click_button "Preview allocations"
      
      # Verify qualified dividend indicator
      within(:table_row, { "Investor" => qualified_investor.user.full_name }) do
        expect(page).to have_text("Qualified", wait: 5)
        expect(find("[data-testid='qualified-indicator']")).to have_tooltip "These shares qualify for preferential tax treatment"
      end
    end
  end

  describe "authorization" do
    it "prevents non-admin users from accessing dividend computation" do
      sign_in investor1.user
      visit spa_company_administrator_equity_dividend_computation_path(company.external_id)
      
      expect(page).to have_text("You are not authorized to access this page")
      expect(page).to have_current_path(spa_company_path(company.external_id))
    end
    
    it "prevents admin from other company from accessing" do
      other_company = create(:company)
      other_admin = create(:user, :company_administrator, company: other_company)
      
      sign_in other_admin
      visit spa_company_administrator_equity_dividend_computation_path(company.external_id)
      
      expect(page).to have_text("You are not authorized to access this page")
    end
  end

  describe "performance with many investors" do
    before do
      # Create 100 investors
      100.times do |i|
        investor = create(:company_investor, company:)
        create(:share_holding,
          company_investor: investor,
          number_of_shares: rand(100..5000),
          share_class: [common_share_class, preferred_share_class].sample
        )
        create(:user_compliance_info, 
          user: investor.user,
          us_tax_resident: [true, false].sample,
          country_code: ["US", "CA", "GB", "DE", "FR", "JP"].sample
        )
      end
    end

    it "handles computation efficiently" do
      visit spa_company_administrator_equity_dividend_computation_path(company.external_id)
      
      fill_in "Total dividend amount", with: "1000000"
      find_button(text: /Issuance date/).click
      find_button(text: Date.current.day.to_s).click
      
      # Should complete within reasonable time
      click_button "Preview allocations"
      
      expect(page).to have_text("Allocation preview", wait: 10)
      expect(page).to have_css("table tbody tr", count: 20) # Should paginate
      
      # Verify pagination
      expect(page).to have_text("Showing 1-20 of 105")
      expect(page).to have_button("Next")
      
      click_button "Next"
      expect(page).to have_text("Showing 21-40 of 105")
    end
  end
end