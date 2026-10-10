import React, { useState, useEffect, useRef } from 'react';
import { Check, MessageSquare, Loader2, ChevronDown, Phone, ShieldCheck } from 'lucide-react';
import { 
  SUPPORTED_COUNTRIES, 
  CountryCodeOption, 
  formatFullPhoneNumber, 
  isValidPhoneNumber,
  sendWhatsAppOtp, 
  verifyWhatsAppOtp 
} from '../lib/whatsappOtpService';

export interface PhoneVerificationInputProps {
  id?: string;
  value: string;
  onChange: (fullPhone: string, localPhone: string, countryCode: string) => void;
  isVerified?: boolean;
  onVerifiedChange?: (isVerified: boolean) => void;
  userType?: 'merchant' | 'customer';
  label?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  defaultCountryCode?: string; // '+880' | '+966' | '+968'
  darkMode?: boolean;
  /**
   * Where to send the SAME code if WhatsApp dispatch fails. Without this the
   * merchant has no fallback channel when WhatsApp is unavailable.
   */
  fallbackEmail?: string;
}

export const PhoneVerificationInput: React.FC<PhoneVerificationInputProps> = ({
  id = 'phone-verification-input',
  value = '',
  onChange,
  isVerified = false,
  onVerifiedChange,
  userType = 'merchant',
  label = 'Phone Number (হোয়াটসঅ্যাপ নম্বর)',
  required = true,
  disabled = false,
  className = '',
  defaultCountryCode = '+880',
  darkMode = true,
  fallbackEmail,
}) => {
  // Determine initial country code from existing value if any
  const detectCountry = (val: string): CountryCodeOption => {
    if (val.startsWith('+966') || val.startsWith('966')) {
      return SUPPORTED_COUNTRIES.find(c => c.code === '+966') || SUPPORTED_COUNTRIES[0];
    }
    if (val.startsWith('+880') || val.startsWith('880')) {
      return SUPPORTED_COUNTRIES.find(c => c.code === '+880') || SUPPORTED_COUNTRIES[0];
    }
    return SUPPORTED_COUNTRIES.find(c => c.code === defaultCountryCode) || SUPPORTED_COUNTRIES[0];
  };

  const [selectedCountry, setSelectedCountry] = useState<CountryCodeOption>(() => detectCountry(value));
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Extract initial local digits without country code prefix
  const getInitialLocalDigits = (val: string, country: CountryCodeOption) => {
    let clean = val.replace(/[^\d+]/g, '');
    if (clean.startsWith(country.code)) {
      clean = clean.slice(country.code.length);
    } else if (clean.startsWith(country.code.replace('+', ''))) {
      clean = clean.slice(country.code.length - 1);
    }
    return clean;
  };

  const [localNumber, setLocalNumber] = useState<string>(() => getInitialLocalDigits(value, selectedCountry));
  const [otpCode, setOtpCode] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'info' | 'error' | 'success' } | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [whatsappDirectLink, setWhatsappDirectLink] = useState<string | null>(null);
  const [providerInfo, setProviderInfo] = useState<string | null>(null);
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle resend countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Sync state if external value changes
  useEffect(() => {
    if (value) {
      const country = detectCountry(value);
      setSelectedCountry(country);
      setLocalNumber(getInitialLocalDigits(value, country));
    }
  }, [value]);

  const handleCountrySelect = (country: CountryCodeOption) => {
    setSelectedCountry(country);
    setDropdownOpen(false);

    // Invalidate verification if country code changed
    if (isVerified && onVerifiedChange) {
      onVerifiedChange(false);
    }
    setIsOtpSent(false);
    setStatusMessage(null);
    setDevOtpCode(null);

    const fullPhone = formatFullPhoneNumber(localNumber, country.code);
    onChange(fullPhone, localNumber, country.code);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    // Allow digits, spaces, hyphens
    const cleanDigits = rawVal.replace(/[^\d]/g, '');
    setLocalNumber(cleanDigits);

    if (isVerified && onVerifiedChange) {
      onVerifiedChange(false);
    }
    setIsOtpSent(false);
    setStatusMessage(null);
    setDevOtpCode(null);

    const fullPhone = formatFullPhoneNumber(cleanDigits, selectedCountry.code);
    onChange(fullPhone, cleanDigits, selectedCountry.code);
  };

  const handleSendOtp = async () => {
    setStatusMessage(null);
    setWhatsappDirectLink(null);
    setDevOtpCode(null);
    const fullPhone = formatFullPhoneNumber(localNumber, selectedCountry.code);
    const validation = isValidPhoneNumber(fullPhone);

    if (!validation.valid) {
      setStatusMessage({
        text: validation.error || `Please enter a valid ${selectedCountry.country} phone number.`,
        type: 'error'
      });
      return;
    }

    setIsSending(true);
    const role: 'merchant' | 'customer' = userType === 'customer' ? 'customer' : 'merchant';
    const result = await sendWhatsAppOtp(fullPhone, role, selectedCountry.code, fallbackEmail);
    setIsSending(false);

    if (result.success) {
      setIsOtpSent(true);
      setResendCooldown(60); // 60s cooldown
      if (result.directLink) {
        setWhatsappDirectLink(result.directLink);
      }
      if (result.provider) {
        setProviderInfo(result.provider);
      }
      if (result.codePreview) {
        setDevOtpCode(result.codePreview);
        setOtpCode(result.codePreview);
      }
      setStatusMessage({
        text: result.message || `WhatsApp OTP generated for ${fullPhone}.`,
        type: 'info'
      });
    } else {
      setStatusMessage({
        text: result.message || 'Failed to dispatch WhatsApp OTP. Please try again.',
        type: 'error'
      });
    }
  };

  const handleVerifyOtp = async (codeToVerify?: string) => {
    setStatusMessage(null);
    const targetCode = (codeToVerify || otpCode).trim();
    if (!targetCode || targetCode.length !== 6) {
      setStatusMessage({
        text: 'Please enter the 6-digit WhatsApp OTP verification code.',
        type: 'error'
      });
      return;
    }

    const fullPhone = formatFullPhoneNumber(localNumber, selectedCountry.code);
    setIsVerifying(true);
    const result = await verifyWhatsAppOtp(fullPhone, targetCode, selectedCountry.code);
    setIsVerifying(false);

    if (result.success && result.verified) {
      setIsOtpSent(false);
      setDevOtpCode(null);
      if (onVerifiedChange) {
        onVerifiedChange(true);
      }
      setStatusMessage({
        text: `Phone verified successfully via WhatsApp OTP ✓ (${fullPhone})`,
        type: 'success'
      });
    } else {
      setStatusMessage({
        text: result.message || 'Invalid or expired OTP code. Please check and retry.',
        type: 'error'
      });
    }
  };

  const bgInput = darkMode ? 'bg-[#161923] border-[#3A435E] text-white focus:border-[#25D366]' : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-[#25D366]';
  const bgDropdown = darkMode ? 'bg-[#1D2230] border-[#3A435E] text-white' : 'bg-white border-slate-200 text-slate-800 shadow-xl';
  const bgBadge = darkMode ? 'bg-[#252B3B] border-[#3A435E] text-slate-200' : 'bg-slate-100 border-slate-300 text-slate-700';

  return (
    <div id={id} className={`space-y-1.5 ${className}`}>
      {/* Label and Verified Badge */}
      <div className="flex items-center justify-between">
        <label className={`block text-xs font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
        {isVerified && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#25D366] bg-[#25D366]/10 px-2 py-0.5 rounded-md border border-[#25D366]/30 animate-in fade-in">
            <Check className="w-3.5 h-3.5" /> WhatsApp Verified
          </span>
        )}
      </div>

      {/* Main Input Control Group */}
      <div className="flex gap-2 relative">
        {/* Country Selector Dropdown Toggle */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            id={`${id}-country-selector-btn`}
            onClick={() => !disabled && setDropdownOpen(!dropdownOpen)}
            disabled={disabled}
            className={`h-full flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-mono font-bold transition select-none cursor-pointer ${bgBadge} hover:border-[#25D366]/60`}
            title={`Selected: ${selectedCountry.country} (${selectedCountry.code})`}
          >
            <span className="text-base leading-none">{selectedCountry.flag}</span>
            <span className="font-bold">{selectedCountry.code}</span>
            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Country Selection Menu */}
          {dropdownOpen && (
            <div className={`absolute left-0 top-full mt-1.5 w-60 rounded-xl border p-1.5 z-50 shadow-2xl backdrop-blur-md ${bgDropdown} animate-in fade-in zoom-in-95 duration-150`}>
              <div className="px-2.5 py-1 text-[10px] uppercase tracking-wider font-extrabold text-slate-400 border-b border-slate-700/50 mb-1">
                Select Country Code (দেশ নির্বাচন)
              </div>
              {SUPPORTED_COUNTRIES.map((c) => {
                const isSelected = c.code === selectedCountry.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => handleCountrySelect(c)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition cursor-pointer ${
                      isSelected 
                        ? 'bg-[#25D366]/20 text-[#25D366] font-bold' 
                        : darkMode ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-slate-100 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg leading-none">{c.flag}</span>
                      <div className="text-left">
                        <div className="font-semibold text-xs leading-tight">{c.country}</div>
                        <div className="text-[10px] opacity-70 font-mono">e.g. {c.example}</div>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-xs">{c.code}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Local Phone Input */}
        <div className="relative flex-1">
          <input
            type="tel"
            id={`${id}-phone-input`}
            value={localNumber}
            onChange={handleNumberChange}
            disabled={disabled}
            placeholder={selectedCountry.placeholder}
            className={`w-full border rounded-xl px-3 py-2.5 text-sm font-mono outline-none transition ${bgInput}`}
          />
        </div>

        {/* Trigger Verification Button */}
        {!isVerified ? (
          <button
            type="button"
            id={`${id}-send-otp-btn`}
            onClick={handleSendOtp}
            disabled={isSending || !localNumber.trim() || disabled}
            className="px-3.5 py-2.5 bg-[#25D366] hover:bg-[#20ba5a] active:scale-[0.98] disabled:opacity-50 text-slate-950 font-extrabold rounded-xl text-xs flex items-center gap-1.5 shrink-0 transition cursor-pointer shadow-md"
          >
            {isSending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Verify via WhatsApp</span>
              </>
            )}
          </button>
        ) : (
          <div className="px-3.5 py-2.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-bold rounded-xl text-xs flex items-center gap-1.5 shrink-0 select-none">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Verified</span>
          </div>
        )}
      </div>

      {/* Conditionally Revealed OTP Code Input Box */}
      {isOtpSent && !isVerified && (
        <div className={`p-3.5 rounded-xl border mt-2 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200 ${
          darkMode ? 'bg-[#131926] border-[#25D366]/40' : 'bg-emerald-50/50 border-emerald-300'
        }`}>
          {/* Header */}
          <div className="flex items-center justify-between text-xs">
            <span className={`font-bold flex items-center gap-1.5 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
              <MessageSquare className="w-4 h-4 text-[#25D366]" />
              Enter 6-Digit WhatsApp OTP ({selectedCountry.code})
            </span>
            <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Supabase OTP
            </span>
          </div>

          {/* Dev/Fallback OTP Quick Action Card */}
          {devOtpCode && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs text-amber-300 font-medium">
                <span>🧪</span>
                <span>Testing Code:</span>
                <strong className="font-mono text-sm font-black text-amber-200 tracking-wider bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">
                  {devOtpCode}
                </strong>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setOtpCode(devOtpCode);
                    handleVerifyOtp(devOtpCode);
                  }}
                  className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-950 font-bold rounded-md text-[11px] transition shadow cursor-pointer flex items-center gap-1"
                >
                  <span>⚡ Auto-Verify</span>
                </button>
              </div>
            </div>
          )}

          {/* OTP Input and Verify Button */}
          <div className="flex gap-2">
            <input
              type="text"
              id={`${id}-otp-input`}
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="• • • • • •"
              className={`flex-1 border text-center font-mono font-black tracking-[0.35em] rounded-xl px-3 py-2 text-base outline-none focus:border-[#25D366] ${
                darkMode ? 'bg-[#161923] border-[#3A435E] text-white' : 'bg-white border-slate-300 text-slate-900'
              }`}
              autoFocus
            />
            <button
              type="button"
              id={`${id}-verify-otp-btn`}
              onClick={() => handleVerifyOtp()}
              disabled={isVerifying || otpCode.trim().length < 6}
              className="px-4 py-2 bg-[#25D366] hover:bg-[#20ba5a] active:scale-[0.98] text-slate-950 font-black rounded-xl text-xs disabled:opacity-50 transition cursor-pointer shrink-0 shadow-md"
            >
              {isVerifying ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying...
                </span>
              ) : (
                'Confirm Code'
              )}
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
            <span>Check your WhatsApp app for the 6-digit code sent to <strong className="text-white font-mono">{formatFullPhoneNumber(localNumber, selectedCountry.code)}</strong></span>
            {resendCooldown > 0 ? (
              <span className="text-slate-400 font-mono text-[10px]">Resend in {resendCooldown}s</span>
            ) : (
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={isSending}
                className="text-[#25D366] hover:underline font-bold cursor-pointer"
              >
                Resend Code
              </button>
            )}
          </div>

          {/* Direct WhatsApp Quick-Launch Button */}
          {whatsappDirectLink && (
            <div className="pt-2 border-t border-slate-700/40 flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400 truncate">
                {providerInfo ? `Channel: ${providerInfo}` : 'Live WhatsApp Channel'}
              </span>
              <a
                href={whatsappDirectLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-950 bg-[#25D366] hover:bg-[#20ba5a] px-3 py-1.5 rounded-lg transition shadow cursor-pointer active:scale-95"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>📱 Open WhatsApp App</span>
                <span className="text-[10px]">↗</span>
              </a>
            </div>
          )}
        </div>
      )}

      {/* Status & Feedback Message */}
      {statusMessage && (
        <div className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium ${
          statusMessage.type === 'error'
            ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
            : statusMessage.type === 'success'
            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
            : 'bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/20'
        }`}>
          {statusMessage.type === 'error' ? '⚠️ ' : statusMessage.type === 'success' ? '✓ ' : 'ℹ️ '}
          {statusMessage.text}
        </div>
      )}
    </div>
  );
};
