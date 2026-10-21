import type { MobileBankingConfig } from '../types';

/**
 * Canonical wallet order on the checkout: bKash, then Nagad, then Rocket.
 *
 * The merchant's ACTIVE wallets are rendered in this order, followed by
 * Cash on Delivery — never in raw row order, which depends on the order the
 * dashboard happened to save them in.
 */
export const WALLET_PROVIDERS = ['bkash', 'nagad', 'rocket'] as const;

export type WalletProvider = (typeof WALLET_PROVIDERS)[number];

export function isWalletProvider(value: unknown): value is WalletProvider {
  return WALLET_PROVIDERS.includes(String(value || '').toLowerCase() as WalletProvider);
}

/** Human label used when a stored row carries no display name. */
export const WALLET_LABELS: Record<WalletProvider, string> = {
  bkash: 'bKash',
  nagad: 'Nagad',
  rocket: 'Rocket',
};

const PROVIDER_ALIASES: Record<string, WalletProvider> = {
  bkash: 'bkash',
  'bkash-payment': 'bkash',
  nagad: 'nagad',
  rocket: 'rocket',
  dutchtbangi: 'rocket',
  'dbbl-rocket': 'rocket',
};

function toBool(value: unknown): boolean {
  return value === true || value === 'true' || value === 1;
}

/**
 * Normalise the payment methods a store has configured into the exact shape
 * the checkout renders.
 *
 * The database stores whatever the Merchant Payment Accounts Setup form sent —
 * across app versions that is `mobileBanking` or `mobile_banking`, with
 * `isEnabled` or `enabled`, and numbers that may be numeric or contain spaces.
 * Applying ONE normaliser on both sides of the wire means a wallet activated in
 * the dashboard always appears on the public checkout, and one the merchant
 * switched off never does.
 *
 * Returns only RELIABLE, ENABLED wallets: `isEnabled === true` AND a non-empty
 * number. Anything else is left out so the checkout never offers a method that
 * cannot be paid.
 */
export function normalizeMobileBanking(input: unknown): MobileBankingConfig[] {
  if (!Array.isArray(input)) return [];
  const byProvider = new Map<WalletProvider, MobileBankingConfig>();

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, any>;
    const providerKey = String(
      row.provider || row.method || row.type || row.wallet || '',
    )
      .trim()
      .toLowerCase();
    const provider = PROVIDER_ALIASES[providerKey];
    if (!provider) continue;

    const number = row.number != null ? String(row.number).replace(/[\s-]/g, '').trim() : '';
    const enabled = toBool(row.isEnabled ?? row.enabled ?? row.active ?? row.isActive);
    if (!enabled || !number) continue;

    const next: MobileBankingConfig = {
      ...(row as MobileBankingConfig),
      id: String(row.id || `mb-${provider}`),
      provider,
      displayName: String(row.displayName || row.name || `${WALLET_LABELS[provider]} Direct`),
      accountType: (row.accountType || row.account_type || 'Personal') as MobileBankingConfig['accountType'],
      number,
      isEnabled: true,
      chargePercentage: Number(row.chargePercentage ?? row.charge_percentage ?? 0) || 0,
      instructions: String(row.instructions ?? row.instructionsText ?? row.note ?? ''),
      requireTrxId: row.requireTrxId ?? row.require_trx_id ?? true,
      canPayAdvanceCharge: toBool(row.canPayAdvanceCharge ?? row.can_pay_advance_charge),
    };

    // Merge duplicate rows instead of listing bKash twice. The FIRST enabled
    // row wins the number; a later row only fills in settings the first one
    // left blank.
    const existing = byProvider.get(provider);
    if (existing) {
      byProvider.set(provider, {
        ...existing,
        chargePercentage: existing.chargePercentage || next.chargePercentage,
        instructions: existing.instructions || next.instructions,
        canPayAdvanceCharge: existing.canPayAdvanceCharge || next.canPayAdvanceCharge,
      });
    } else {
      byProvider.set(provider, next);
    }
  }

  return WALLET_PROVIDERS.map((provider) => byProvider.get(provider)).filter(
    (method): method is MobileBankingConfig => Boolean(method),
  );
}

/**
 * Dashboard-side merge of the stored wallets onto the local form state.
 *
 * Unlike `normalizeMobileBanking` this keeps DISABLED wallets — the merchant
 * must be able to see and re-enable a wallet they switched off — and keeps
 * every bKash / Nagad / Rocket slot present so the setup screen always shows
 * all three cards.
 *
 * The database row wins for every field it actually carries; the local copy
 * only fills gaps (e.g. a settings field added in a newer build).
 */
export function mergeStoredWallets(
  stored: unknown,
  local: unknown,
): MobileBankingConfig[] {
  const localList = Array.isArray(local) ? (local as MobileBankingConfig[]) : [];
  if (!Array.isArray(stored)) return localList;

  const byProvider = new Map<string, MobileBankingConfig>();
  for (const method of localList) {
    const provider = String(method?.provider || '').toLowerCase();
    if (provider) byProvider.set(provider, method);
  }

  for (const raw of stored) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, any>;
    const provider = String(row.provider || row.method || row.wallet || '').toLowerCase();
    if (!WALLET_PROVIDERS.includes(provider as WalletProvider)) continue;

    const base = byProvider.get(provider);
    byProvider.set(provider, {
      id: String(row.id || base?.id || `mb-${provider}`),
      provider: provider as WalletProvider,
      displayName: String(row.displayName || row.name || base?.displayName || `${WALLET_LABELS[provider as WalletProvider]} Direct`),
      accountType: (row.accountType || row.account_type || base?.accountType || 'Personal') as MobileBankingConfig['accountType'],
      number: row.number != null ? String(row.number) : (base?.number || ''),
      merchantApiKey: row.merchantApiKey ?? row.merchant_api_key ?? base?.merchantApiKey,
      qrCodeUrl: row.qrCodeUrl ?? base?.qrCodeUrl,
      // An absent flag stays OFF: the checkout requires an explicit activation.
      isEnabled: toBool(row.isEnabled ?? row.enabled ?? row.active ?? row.isActive),
      chargePercentage: Number(row.chargePercentage ?? row.charge_percentage ?? base?.chargePercentage ?? 0) || 0,
      instructions: String(row.instructions ?? row.instructionsText ?? row.note ?? base?.instructions ?? ''),
      requireTrxId: row.requireTrxId ?? row.require_trx_id ?? base?.requireTrxId ?? true,
      canPayAdvanceCharge: toBool(row.canPayAdvanceCharge ?? row.can_pay_advance_charge ?? base?.canPayAdvanceCharge),
    });
  }

  // Stable card order: bKash, Nagad, Rocket, then any legacy extras.
  const ordered = WALLET_PROVIDERS
    .map((provider) => byProvider.get(provider))
    .filter((method): method is MobileBankingConfig => Boolean(method));
  for (const method of byProvider.values()) {
    if (!WALLET_PROVIDERS.includes(method.provider)) ordered.push(method);
  }
  return ordered;
}
