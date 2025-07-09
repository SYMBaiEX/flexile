# frozen_string_literal: true

require "rails_helper"

RSpec.describe Internal::Companies::DividendComputationsController, type: :controller do
  let(:company) { create(:company) }
  let(:user) { create(:user) }
  let(:company_administrator) { create(:company_administrator, company:, user:) }
  let(:company_investor) { create(:company_investor, company:, user:) }
  let(:dividend_computation) { create(:dividend_computation, company:) }

  before do
    allow(controller).to receive(:authenticate_user_json!).and_return(true)
    allow(Current).to receive(:user).and_return(user)
    allow(Current).to receive(:company).and_return(company)
    allow(Current).to receive(:company_administrator).and_return(company_administrator)
    allow(Current).to receive(:company_administrator?).and_return(true)
  end

  describe "GET #index" do
    context "when user is company administrator" do
      it "returns all dividend computations for the company" do
        computations = create_list(:dividend_computation, 3, company:)
        
        get :index, params: { company_id: company.id }
        
        expect(response).to have_http_status(:ok)
        json_response = JSON.parse(response.body)
        expect(json_response.size).to eq(3)
      end
    end

    context "when user is not company administrator" do
      before do
        allow(Current).to receive(:company_administrator).and_return(nil)
        allow(Current).to receive(:company_administrator?).and_return(false)
      end

      it "denies access" do
        expect { get :index, params: { company_id: company.id } }
          .to raise_error(Pundit::NotAuthorizedError)
      end
    end
  end

  describe "GET #show" do
    context "when user is company administrator" do
      it "returns dividend computation with outputs" do
        computation = create(:dividend_computation, company:)
        create_list(:dividend_computation_output, 2, dividend_computation: computation)
        
        get :show, params: { company_id: company.id, id: computation.id }
        
        expect(response).to have_http_status(:ok)
        json_response = JSON.parse(response.body)
        expect(json_response["outputs"].size).to eq(2)
        expect(json_response).to have_key("summary")
      end
    end
  end

  describe "POST #create" do
    context "with valid parameters" do
      let(:valid_params) do
        {
          company_id: company.id,
          dividend_computation: {
            amount_in_usd: 100_000,
            dividends_issuance_date: Date.current,
            return_of_capital: false
          }
        }
      end

      it "creates a new dividend computation" do
        allow_any_instance_of(DividendComputationGeneration).to receive(:process)
          .and_return(build(:dividend_computation, company:))

        expect {
          post :create, params: valid_params
        }.to change { DividendComputation.count }.by(0) # Mocked, so no actual creation

        expect(response).to have_http_status(:created)
      end
    end

    context "with invalid parameters" do
      let(:invalid_params) do
        {
          company_id: company.id,
          dividend_computation: {
            amount_in_usd: nil,
            dividends_issuance_date: Date.current,
            return_of_capital: false
          }
        }
      end

      it "returns unprocessable entity" do
        post :create, params: invalid_params

        expect(response).to have_http_status(:unprocessable_entity)
        json_response = JSON.parse(response.body)
        expect(json_response).to have_key("error")
      end
    end
  end

  describe "POST #preview" do
    let(:preview_params) do
      {
        company_id: company.id,
        dividend_computation: {
          amount_in_usd: 50_000,
          dividends_issuance_date: Date.tomorrow,
          return_of_capital: true
        }
      }
    end

    it "returns preview without persisting" do
      post :preview, params: preview_params

      expect(response).to have_http_status(:ok)
      expect { post :preview, params: preview_params }.not_to change { DividendComputation.count }
    end
  end

  describe "POST #generate_dividends" do
    context "when no existing dividend round conflicts" do
      it "generates dividends successfully" do
        computation = create(:dividend_computation, company:, dividends_issuance_date: Date.current)
        create(:dividend_computation_output, dividend_computation: computation)

        post :generate_dividends, params: { company_id: company.id, id: computation.id }

        expect(response).to have_http_status(:ok)
        json_response = JSON.parse(response.body)
        expect(json_response["success"]).to be true
      end
    end

    context "when dividend round already exists" do
      it "returns unprocessable entity" do
        computation = create(:dividend_computation, company:, dividends_issuance_date: Date.current)
        create(:dividend_round, company:, issued_at: Date.current)

        post :generate_dividends, params: { company_id: company.id, id: computation.id }

        expect(response).to have_http_status(:unprocessable_entity)
        json_response = JSON.parse(response.body)
        expect(json_response["error"]).to include("already exists")
      end
    end
  end
end