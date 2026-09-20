import React from 'react';
import { MerchantProfile, Product, BankAccount, MobileBankingConfig } from '../types';
import { TenantStorefrontView } from './TenantStorefrontView';
import { SupermarketTechMockup, ElegantFashionMockup } from './ThemeMockups';
import { resolveLayoutForTheme, SAMPLE_PRODUCTS, SAMPLE_STORE, ThemeLayoutKey } from '../lib/themeRegistry';

/**
 * LiveThemePreview — renders the ACTUAL storefront layout for a given theme id.
 *
 * This is the shared renderer behind every "preview" surface:
 *   - the Super Admin Theme Manager eye icon,
 *   - the merchant Theme catalogue "Live Demo" button,
 *   - the storefront preview modal.
 *
 * It never redirects to login and never requires a real store: when no live
 * data is supplied it renders the theme against SAMPLE store data, so an admin
 * can preview a brand-new theme the moment they create it.
 */
export interface LiveThemePreviewProps {
  /** Theme id to resolve to a layout. */
  themeId?: string;
  /** Theme category/name — used by the layout heuristics when id is unknown. */
  category?: string;
  name?: string;
  /** Explicit layout override (highest priority). */
  layout?: ThemeLayoutKey;
  /** Optional real store data; sample data is used when omitted. */
  merchant?: MerchantProfile | null;
  products?: Product[];
  bankAccounts?: BankAccount[];
  mobileBanking?: MobileBankingConfig[];
  /** When true, disables interactivity (used in tiled thumbnails). */
  compact?: boolean;
  onPlaceOrder?: (order: any) => void;
}

export const LiveThemePreview: React.FC<LiveThemePreviewProps> = ({
  themeId,
  category,
  name,
  layout,
  merchant,
  products,
  bankAccounts = [],
  mobileBanking = [],
  compact = false,
  onPlaceOrder,
}) => {
  const resolvedLayout = layout || resolveLayoutForTheme({ id: themeId, category, name });

  // Fall back to sample data so a preview always renders something meaningful.
  const previewMerchant = (merchant || SAMPLE_STORE.merchant) as MerchantProfile;
  const previewProducts = (Array.isArray(products) && products.length > 0
    ? products
    : SAMPLE_PRODUCTS) as unknown as Product[];

  if (resolvedLayout === 'supermarket') {
    return <SupermarketTechMockup />;
  }

  if (resolvedLayout === 'fashion') {
    return <ElegantFashionMockup />;
  }

  return (
    <TenantStorefrontView
      storeSlug={previewMerchant.storeSlug || SAMPLE_STORE.slug}
      merchant={{ ...previewMerchant, activeThemeId: themeId || previewMerchant.activeThemeId }}
      products={previewProducts}
      bankAccounts={bankAccounts}
      mobileBanking={mobileBanking}
      themes={[]}
      previewThemeId={themeId}
      compact={compact}
      onPlaceOrder={onPlaceOrder || (() => { /* demo preview: orders are not persisted */ })}
    />
  );
};

export default LiveThemePreview;
