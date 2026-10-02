import React from 'react';
import { CheckCircle2, ArrowRight, Sparkles } from 'lucide-react';
import { subscriptionPlans } from '../data/initialData';
import { monthlyPriceOf, resolvePlanPricing, sortPlansByTier, derivePlanFeatures, isFreeTierPlan } from '../lib/planPricing';
import { LanguageToggle } from './LanguageToggle';
import { BrandLogo } from './BrandLogo';
import { useLanguage } from '../lib/i18n';

interface PublicPricingLandingProps {
  onSelectPlan: (planId: string) => void;
  onLoginClick: () => void;
  isAuthenticated?: boolean;
  onGoToDashboard?: () => void;
}

export const PublicPricingLanding: React.FC<PublicPricingLandingProps> = ({ 
  onSelectPlan, 
  onLoginClick,
  isAuthenticated,
  onGoToDashboard
}) => {
  const { t } = useLanguage();
  return (
    <div id="pricing-landing-container" className="min-h-screen bg-slate-950 text-white font-sans selection:bg-[#D4AF37] selection:text-slate-950 flex flex-col overflow-hidden">
      {/* Navbar */}
      <nav id="pricing-navbar" className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900">
        <BrandLogo size="md" showSubtitle={false} />
        <div className="flex items-center gap-4 text-sm font-semibold">
          <LanguageToggle compact />
          {isAuthenticated && onGoToDashboard ? (
            <button 
              id="pricing-dashboard-btn"
              onClick={onGoToDashboard} 
              className="bg-[#D4AF37] hover:bg-[#e4be42] text-slate-950 px-4 py-2 rounded-xl transition flex items-center gap-2 font-bold cursor-pointer"
            >
              <span>{t('go_to_dashboard')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <>
              <button 
                id="pricing-signin-btn"
                onClick={onLoginClick} 
                className="text-slate-300 hover:text-white transition cursor-pointer"
              >
                {t('sign_in')}
              </button>
              <button 
                id="pricing-start-trial-btn"
                onClick={() => onSelectPlan('free_trial')}
                className="bg-[#D4AF37] hover:bg-[#e4be42] text-slate-950 px-4 py-2 rounded-xl transition flex items-center gap-2 cursor-pointer font-bold"
              >
                <span>{t('start_free_trial')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <div id="pricing-hero" className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-16 w-full flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900 border border-[#D4AF37]/30 text-[#D4AF37] text-xs font-bold uppercase tracking-wider mb-6">
          <Sparkles className="w-4 h-4" />
          <span>{t('land_launch_badge')}</span>
        </div>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-tight mb-6 max-w-4xl">
          {t('land_hero_title_1')} <br />
          <span className="text-[#D4AF37]">{t('land_hero_title_2')}</span>
        </h1>
        <p className="text-base md:text-lg text-slate-400 max-w-2xl mb-12">
          {t('land_hero_subtitle')}
        </p>

        {/* Pricing Grid */}
        {/* Three tiers in the live catalogue (Free Trial / Rise / Growth), so the
            grid is a clean 3-up. The Free Trial is a real, admin-editable plan
            row and renders from that data like any other card — the previously
            hardcoded trial card duplicated it and could not be edited from
            /admin/plans, so the marketing price and the billable catalogue
            drifted apart. */}
        <div id="pricing-plans-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">

          {/* Map real subscription plans */}
          {sortPlansByTier(subscriptionPlans.filter(p => p.isActive)).map((plan) => {
            const isFree = isFreeTierPlan(plan.id);
            // Prefer the admin-authored bullet list; only derive from the flag
            // matrix when the admin has not written one.
            const bullets = derivePlanFeatures(plan);
            return (
            <div 
              key={plan.id} 
              id={`plan-card-${plan.id}`}
              className={`bg-slate-900 border rounded-2xl p-6 flex flex-col text-left transition-colors relative ${
                plan.isPopular 
                  ? 'border-[#D4AF37]' 
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              {plan.isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#D4AF37] text-slate-950 text-[10px] font-black uppercase px-3 py-1 rounded-full whitespace-nowrap">
                  {t('land_most_popular')}
                </div>
              )}
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-xl font-bold text-white">{plan.name}</h3>
              </div>
              <p className="text-sm text-slate-400 mb-4 h-10">
                {isFree ? t('land_free_trial_desc') : t('land_plan_desc')}
              </p>
              <div className="mb-6">
                {/* Quote the MONTHLY term — this is the entry price merchants
                    see before choosing a term, and `price` is kept in sync
                    with `monthlyPrice` by the admin editor. The trial is
                    ৳0 for its whole term, so it is labelled by duration
                    rather than as a per-month rate. */}
                <span className="text-4xl font-black text-white">৳{monthlyPriceOf(plan).toLocaleString()}</span>
                <span className="text-slate-500"> {isFree ? `/ ${t('land_days')}` : `/ ${t('land_month')}`}</span>
              </div>
              {/* Tease the annual saving so the landing page matches the
                  checkout toggle the merchant will meet next. */}
              {!isFree && resolvePlanPricing(plan, 'yearly').discountPercent > 0 && (
                <div className="text-xs font-bold text-[#00D68F] mb-4">
                  {t('land_or_save')} ৳{resolvePlanPricing(plan, 'yearly').price.toLocaleString()}/{t('land_year')} — save{' '}
                  {resolvePlanPricing(plan, 'yearly').discountPercent}%
                </div>
              )}
              <button 
                id={`plan-btn-${plan.id}`}
                onClick={() => onSelectPlan(plan.id)}
                className={`w-full font-bold py-3 rounded-xl mb-6 transition cursor-pointer ${
                  plan.isPopular
                    ? 'bg-[#D4AF37] hover:bg-[#e4be42] text-slate-950'
                    : 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white'
                }`}
              >
                {isFree ? t('start_free_trial') : t('land_subscribe_now')}
              </button>
              <div className="space-y-3 flex-1">
                {bullets.map((feat, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>
            );
          })}

        </div>
      </div>
    </div>
  );
};

