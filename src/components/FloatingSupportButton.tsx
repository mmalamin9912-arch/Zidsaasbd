/**
 * Global floating support button for the storefront.
 *
 * Renders a fixed "Help / Support" pill at the bottom-right corner of every
 * storefront page. Clicking it opens the smart support modal (the
 * predefined-issue + vendor-routing panel), so a customer can reach help from
 * anywhere without hunting for the profile menu.
 *
 * The button sits ABOVE the existing Messenger / WhatsApp float (bottom-6) by
 * using bottom-24, so both widgets stay tappable when a store enables them.
 */

import React from 'react';
import { Headphones } from 'lucide-react';

interface FloatingSupportButtonProps {
  /** Open the smart support modal. */
  onClick: () => void;
  /** Accessible label; Bangla storefronts pass their own. */
  label?: string;
}

const FloatingSupportButton: React.FC<FloatingSupportButtonProps> = ({
  onClick,
  label = 'Help / Support',
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-testid="floating-support-widget"
      className="group fixed bottom-24 right-6 z-[9999] flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-white shadow-2xl shadow-indigo-900/40 ring-1 ring-white/25 transition hover:scale-105 hover:from-indigo-500 hover:to-violet-500 active:scale-95 cursor-pointer"
    >
      <span className="relative flex h-6 w-6 items-center justify-center">
        {/* Soft pulse ring so the button reads as "live help", not decoration. */}
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/30 opacity-75" />
        <Headphones className="relative h-5 w-5" />
      </span>
      <span className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-bold transition-all duration-300 group-hover:max-w-[10rem] sm:max-w-[10rem]">
        {label}
      </span>
    </button>
  );
};

export default FloatingSupportButton;
