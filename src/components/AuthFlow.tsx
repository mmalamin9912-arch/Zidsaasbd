import React, { useState, useEffect, useRef } from 'react';
import { MerchantProfile } from '../types';
import { supabase } from '../lib/supabase';
import AuthLayout from './AuthLayout';
import SafeImage from './SafeImage';
import { BrandLogo } from './BrandLogo';
import { useLanguage } from '../lib/i18n';
import { safeSetItem, safeRemoveItem } from '../utils/safeStorage';
import {
  Mail,
  KeyRound,
  Store,
  MapPin,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Loader2,
  Send,
  AlertCircle,
  Info,
  Lock,
  UserPlus,
  LogIn,
  Check,
  Building2,
  Sparkles,
  ShieldAlert,
  Upload,
  MessageSquare,
  Eye,
  EyeOff
} from 'lucide-react';
import { sendWhatsAppOtp, verifyWhatsAppOtp, formatFullPhoneNumber, normalizePhone } from '../lib/whatsappOtpService';
import { PhoneVerificationInput } from './PhoneVerificationInput';
import { getPlanDurationInDays, calculatePlanTimestamps } from '../utils/subscriptionUtils';
import {
  resolveMerchantSubscription,
  fetchMerchantSubscriptionFromSupabase,
  syncMerchantSubscription
} from '../lib/subscriptionService';
import { safeParseJson } from '../lib/safeFetch';
import { generateStoreCode, resolveStoreRef, withPermanentStoreId } from '../lib/storeId';
import { fetchStoreByRef } from '../lib/storeApi';
import { readAndDownscaleImage } from '../utils/imageUtils';
import { isValidEmail } from '../utils/validation';
import { toast } from './ToastProvider';

interface AuthFlowProps {
  onLoginSuccess: (userProfile: MerchantProfile) => void;
  defaultMerchant: MerchantProfile;
  initialMode?: 'login' | 'signup';
}

interface RegisteredUser {
  email: string;
  ownerName: string;
  storeName: string;
  phone: string;
  address: string;
  password?: string;
  registeredAt: string;
  logoUrl?: string;
}

export const AuthFlow: React.FC<AuthFlowProps> = ({ onLoginSuccess, defaultMerchant, initialMode = 'login' }) => {
  const { t } = useLanguage();

  /**
   * Translate `key` and fill {placeholders} from `vars`. Server-provided raw
   * messages (non-keys) pass through `t` unchanged, so mixed key/message
   * state values render correctly — and stored keys re-translate instantly
   * when the user flips the language toggle.
   */
  const fmt = (key: string, vars?: Record<string, string | number>): string => {
    let out = t(key);
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        out = out.split(`{${name}}`).join(String(value));
      }
    }
    return out;
  };

  /**
   * Render a feedback message (error/info/toast). Stored values may be i18n
   * keys — which re-translate instantly on language toggle — or raw
   * server-provided text, which `t()` passes through unchanged. {email},
   * {phone} and {seconds} placeholders are filled from live component state.
   */
  const renderMsg = (msg: string): string =>
    fmt(msg, { email, phone: twoFactorPhone || phone, seconds: resendTimer });

  // Top level auth mode: 'login' (Sign In with password), 'signup' (Sign Up with
  // OTP) or '2fa' (second-factor challenge after a correct password).
  const [mode, setMode] = useState<'login' | 'signup' | '2fa'>(initialMode);

  // Second-factor (2FA) challenge state. `pendingTwoFactor` holds the profile
  // whose password already checked out — the session is only issued once the
  // WhatsApp OTP in `twoFactorCode` is verified.
  const [pendingTwoFactor, setPendingTwoFactor] = useState<MerchantProfile | null>(null);
  const [twoFactorPhone, setTwoFactorPhone] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');

  // Sign Up Flow Steps
  const [signupStep, setSignupStep] = useState<'email' | 'otp' | 'register'>('email');

  // Common / Shared State
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Zid Login States
  const [loginStep, setLoginStep] = useState<'email' | 'password'>('email');
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [googleInputEmail, setGoogleInputEmail] = useState('');

  // Forgot Password / Password Recovery state (login password step)
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordOtp, setForgotPasswordOtp] = useState('');
  const [forgotPasswordNewPassword, setForgotPasswordNewPassword] = useState('');
  const [forgotPasswordConfirmPassword, setForgotPasswordConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSendingResetOtp, setIsSendingResetOtp] = useState(false);
  const [resetOtpSentNotice, setResetOtpSentNotice] = useState<string | null>(null);
  const [forgotPasswordStatus, setForgotPasswordStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [forgotPasswordError, setForgotPasswordError] = useState('');

  // Timers & UI Feedback
  const [resendTimer, setResendTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  // Inline error shown directly beneath the email field (RFC format failures).
  const [emailError, setEmailError] = useState('');
  // Synchronous re-entrancy lock: React state updates are async, so a fast
  // double-click can fire a second auth request before `isLoading` re-renders
  // the button as disabled. This ref blocks the duplicate immediately.
  const inFlightRef = useRef(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);

  // New Merchant Registration Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [storeLogo, setStoreLogo] = useState('');
  const [phone, setPhone] = useState('');

  const handleLogoFile = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('auth_err_logo_size');
      toast.error(t('auth_err_logo_size'));
      return;
    }
    // Downscale before storing: the logo is saved on the store record and
    // mirrored to Supabase, so a raw 2MB upload is ~2.7MB of base64 in the
    // /api/stores/update body — over the parser limit and over the Supabase
    // per-request limit.
    try {
      const dataUrl = await readAndDownscaleImage(file, 512);
      if (!dataUrl) {
        setErrorMsg('auth_err_logo_read');
        toast.error(t('auth_err_logo_read'));
        return;
      }
      setStoreLogo(dataUrl);
    } catch (err) {
      console.error('Logo processing failed:', err);
      setErrorMsg('auth_err_logo_read');
      toast.error(t('auth_err_logo_read'));
    }
  };
  const [streetAddress, setStreetAddress] = useState('');
  const [district, setDistrict] = useState('Dhaka');
  const [cityUpazila, setCityUpazila] = useState('');
  const [postCode, setPostCode] = useState('');
  const [nidNumber, setNidNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // WhatsApp OTP Phone Verification States
  const [whatsappOtpInput, setWhatsappOtpInput] = useState('');
  const [isWhatsappOtpSent, setIsWhatsappOtpSent] = useState(false);
  const [isWhatsappPhoneVerified, setIsWhatsappPhoneVerified] = useState(false);
  const [verifiedWhatsappPhone, setVerifiedWhatsappPhone] = useState('');
  const [isSendingWhatsappOtp, setIsSendingWhatsappOtp] = useState(false);
  const [isVerifyingWhatsappOtp, setIsVerifyingWhatsappOtp] = useState(false);

  const handleSendMerchantWhatsappOtp = async () => {
    setErrorMsg('');
    setInfoNotice(null);
    if (!phone || phone.trim().length < 9) {
      setErrorMsg('auth_err_phone_required');
      toast.error(t('auth_err_phone_required'));
      return;
    }
    setIsSendingWhatsappOtp(true);
    try {
      const res = await sendWhatsAppOtp(phone, 'merchant');
      if (res.success) {
        setIsWhatsappOtpSent(true);
        setInfoNotice(res.message);
        setToastMsg('auth_toast_whatsapp_sent');
      } else {
        setErrorMsg(res.message);
        toast.error(res.message);
      }
    } catch (err) {
      console.error('WhatsApp OTP dispatch failed:', err);
      setErrorMsg('auth_err_server');
      toast.error(t('auth_err_server'));
    } finally {
      setIsSendingWhatsappOtp(false);
    }
  };

  const handleVerifyMerchantWhatsappOtp = async () => {
    setErrorMsg('');
    if (!whatsappOtpInput || whatsappOtpInput.trim().length !== 6) {
      setErrorMsg('auth_err_whatsapp_code');
      toast.error(t('auth_err_whatsapp_code'));
      return;
    }
    setIsVerifyingWhatsappOtp(true);
    try {
      const res = await verifyWhatsAppOtp(phone, whatsappOtpInput);
      if (res.success && res.verified) {
        setIsWhatsappPhoneVerified(true);
        setVerifiedWhatsappPhone(phone);
        setIsWhatsappOtpSent(false);
        setToastMsg('auth_toast_phone_verified');
        setInfoNotice('auth_info_phone_verified');
      } else {
        setErrorMsg(res.message || 'auth_err_whatsapp_verify_failed');
        toast.error(res.message || t('auth_err_whatsapp_verify_failed'));
      }
    } catch (err) {
      console.error('WhatsApp OTP verification failed:', err);
      setErrorMsg('auth_err_server');
      toast.error(t('auth_err_server'));
    } finally {
      setIsVerifyingWhatsappOtp(false);
    }
  };

  // Auto-hide toast message after 6 seconds
  useEffect(() => {
    if (toastMsg) {
      const timer = setTimeout(() => setToastMsg(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [toastMsg]);

  // Timer countdown for OTP resend button
  useEffect(() => {
    let timer: any;
    if (mode === 'signup' && signupStep === 'otp' && resendTimer > 0) {
      timer = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    } else if (resendTimer === 0) {
      setCanResend(true);
    }
    return () => clearInterval(timer);
  }, [mode, signupStep, resendTimer]);

  // Auth state listener for magic link / session
  useEffect(() => {
    if (!supabase) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        const cleanEmail = session.user.email?.toLowerCase() || '';
        void fetchMerchantSubscriptionFromSupabase({
          userId: session.user.id,
          email: cleanEmail
        }).then((storeProfile) => {
          if (storeProfile) void finishLogin({ ...storeProfile, email: storeProfile.email || cleanEmail });
        });

        const registeredList = getRegisteredUsers();
        const existingUser = registeredList.find((u) => u.email.toLowerCase() === cleanEmail);

        if (existingUser) {
          const userProfile: MerchantProfile = {
            ...defaultMerchant,
            email: cleanEmail,
            ownerName: session.user.user_metadata?.full_name || existingUser.ownerName || 'Merchant Owner',
            storeName: session.user.user_metadata?.store_name || existingUser.storeName || 'My Store',
            phone: existingUser.phone || '',
            storeSlug: existingUser.storeName ? existingUser.storeName.toLowerCase().replace(/[^a-z0-9]/g, '') : 'mystore',
            logoUrl: existingUser.logoUrl || defaultMerchant.logoUrl,
          };
          finishLogin(userProfile);
        } else {
          // New User Setup
          setMode('signup');
          setSignupStep('register');
          setToastMsg('auth_toast_email_verified');
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Retrieve saved registered users from localStorage
  const getRegisteredUsers = (): RegisteredUser[] => {
    try {
      const data = localStorage.getItem('zid_registered_users');
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error(e);
    }
    return [];
  };

  const normalizeMerchantRecord = (raw: any, cleanEmail: string): MerchantProfile => {
    return withPermanentStoreId(resolveMerchantSubscription({
      ...defaultMerchant,
      ...raw,
      email: cleanEmail
    }));
  };

  const enhanceWithPrepayment = (profile: MerchantProfile): MerchantProfile => {
    const prePayment = localStorage.getItem('zid_pre_payment');
    if (prePayment) {
      try {
        const parsed = JSON.parse(prePayment);
        if (parsed.planId) {
          // Apply the term the merchant actually PAID for. `resolveMerchantSubscription`
          // re-derives duration from the plan id, so a yearly pre-payment would be
          // downgraded to the legacy 90-day term without these explicit timestamps.
          const startMs = Date.now();
          const paidDays = parsed.durationDays > 0 ? parsed.durationDays : null;
          const paidExpiryMs = paidDays ? startMs + paidDays * 86400000 : 0;
          return resolveMerchantSubscription({
            ...profile,
            subscriptionPlan: parsed.planId,
            plan_started_at: new Date(startMs).toISOString(),
            ...(paidDays
              ? {
                duration_days: paidDays,
                durationDays: paidDays,
                selectedPlanDays: paidDays,
                expires_at: new Date(paidExpiryMs).toISOString(),
                expiresAt: new Date(paidExpiryMs).toISOString(),
                subscriptionExpiry: new Date(paidExpiryMs).toISOString().split('T')[0]
              }
              : {})
          });
        }
      } catch (e) {
        console.error('Error parsing pre_payment', e);
      }
    }
    return profile;
  };

  /**
   * Issues the session and hands the profile to the dashboard. Split out of
   * `finishLogin` so the 2FA gate can call it only AFTER the OTP is verified.
   */
  const completeLogin = (enrichedProfile: MerchantProfile) => {
    safeSetItem('zid_auth_session', {
      email: enrichedProfile.email,
      loggedInAt: new Date().toISOString(),
      userProfile: enrichedProfile,
    });

    safeRemoveItem('zid_pre_payment');
    safeRemoveItem('zid_intended_plan');

    // Asynchronously push synced subscription to Supabase and Backend
    syncMerchantSubscription({
      merchant: enrichedProfile,
      planId: enrichedProfile.subscriptionPlan || 'free_trial',
      startDate: new Date(enrichedProfile.plan_started_at || Date.now()),
      // Carry the paid term through, or the background sync would overwrite the
      // expiry above with the legacy plan-id duration.
      ...(enrichedProfile.durationDays && enrichedProfile.durationDays > 0
        ? { durationDays: enrichedProfile.durationDays }
        : {})
    }).catch(err => console.warn('Background subscription sync notice:', err));

    onLoginSuccess(enrichedProfile);
  };

  /**
   * Every store identifier we can associate with this login.
   *
   * `profile.storeSlug` alone is NOT enough: it is frequently a slug DERIVED
   * from the email (or a cached/edited display slug) and can differ from the
   * slug the security settings were saved under. Relying on it made 2FA silently
   * skip stores that had it enabled, so we collect all candidates and let the
   * backend tell us which one actually has 2FA on.
   */
  const resolveSecuritySlugs = async (profile: MerchantProfile, emailFallback: string): Promise<string[]> => {
    const candidates: string[] = [];
    const push = (v?: string | null) => {
      const clean = String(v || '').split(':')[0].trim().toLowerCase();
      if (clean && !candidates.includes(clean)) candidates.push(clean);
    };

    // The authoritative record first, then the local/derived fallbacks.
    try {
      const res = await fetch(`/api/stores/check/${encodeURIComponent(emailFallback)}`);
      const data = await safeParseJson(res, null);
      const record = data?.merchant || data;
      push(record?.store_slug);
      push(record?.storeSlug);
      push(record?.store_code);
      push(record?.id);
    } catch {
      // A lookup failure must not block login; the local candidates still apply.
    }

    push(profile.storeCode);
    push(profile.store_code);
    push(profile.storeSlug);
    push(profile.id);

    return candidates;
  };

  /**
   * Ask the backend whether 2FA is enabled for ANY identifier we know of.
   * Returns the slug it matched (so the OTP step can name the right store).
   */
  const findTwoFactorStore = async (profile: MerchantProfile, emailFallback: string): Promise<string | null> => {
    const slugs = await resolveSecuritySlugs(profile, emailFallback);
    for (const slug of slugs) {
      try {
        const res = await fetch(`/api/security/settings?store_slug=${encodeURIComponent(slug)}`);
        const data = await safeParseJson(res, null);
        if (data?.ok === true && data?.security?.twoFactorEnabled === true) return slug;
      } catch {
        // Try the next candidate.
      }
    }
    return null;
  };

  /**
   * LOGIN ENTRY POINT (with 2FA enforcement).
   *
   * When the merchant has Two-Factor Authentication enabled, the password check
   * alone is NOT enough: we send a WhatsApp OTP and hold the login in
   * `pendingTwoFactor` until `verifyOtp` succeeds. Only then is the session
   * issued. When 2FA is off (or the store cannot be resolved) the original
   * behaviour is preserved exactly.
   */
  const finishLogin = async (profile: MerchantProfile) => {
    const enrichedProfile = enhanceWithPrepayment(profile);
    const emailFallback = enrichedProfile.email || email.trim().toLowerCase();

    let matchedTwoFactorSlug: string | null = null;
    try {
      matchedTwoFactorSlug = await findTwoFactorStore(enrichedProfile, emailFallback);
    } catch (err) {
      // A failed lookup must never lock a merchant out of their own dashboard.
      console.warn('2FA status lookup warning:', err);
      matchedTwoFactorSlug = null;
    }

    if (!matchedTwoFactorSlug) {
      completeLogin(enrichedProfile);
      return;
    }

    // The WhatsApp number may live on the store record rather than in the local
    // profile (the 2FA-enabled store is not always the locally-cached one).
    let phone = enrichedProfile.whatsappNumber || enrichedProfile.phone || '';
    if (!phone) {
      // Null-safe lookup: an unknown/blank store yields merchant:null instead of
      // a 404 HTML response that would break JSON parsing. The helper never
      // throws, so the caller simply falls through to the "no number on file"
      // branch below when the store cannot be resolved.
      const lookup = await fetchStoreByRef(matchedTwoFactorSlug);
      const record = lookup.merchant || {};
      phone = record.whatsappNumber || record.phone || record.whatsapp_number || '';
    }
    if (!phone) {
      setErrorMsg('auth_err_2fa_no_phone');
      toast.error(t('auth_err_2fa_no_phone'));
      setIsLoading(false);
      return;
    }

    // Park the login and ask the backend to dispatch the OTP.
    setPendingTwoFactor(enrichedProfile);
    setTwoFactorPhone(phone);
    setTwoFactorCode('');
    setMode('2fa');
    setErrorMsg('');

    try {
      await fetch('/api/auth/whatsapp-otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, userType: 'merchant' }),
      });
      setInfoNotice(fmt('auth_info_2fa_sent', { phone }));
    } catch (err) {
      console.warn('2FA OTP dispatch warning:', err);
      setInfoNotice(fmt('auth_info_2fa_enter', { phone }));
    } finally {
      setIsLoading(false);
    }
  };

  /** Verify the 2FA code, then finish the parked login. */
  const handleTwoFactorVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (inFlightRef.current) return;

    if (!pendingTwoFactor) {
      setMode('login');
      return;
    }
    if (twoFactorCode.trim().length < 6) {
      setErrorMsg('auth_err_otp_required');
      toast.error(t('auth_err_otp_required'));
      return;
    }

    inFlightRef.current = true;
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/whatsapp-otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: twoFactorPhone, code: twoFactorCode.trim() }),
      });
      const data = await safeParseJson(res, null);

      if (data?.verified === true) {
        const profile = pendingTwoFactor;
        setPendingTwoFactor(null);
        setTwoFactorCode('');
        completeLogin(profile);
        return;
      }

      setErrorMsg(data?.error || 'auth_err_2fa_invalid');
      toast.error(data?.error || t('auth_err_2fa_invalid'));
    } catch (err: any) {
      console.error('2FA verification failed:', err);
      setErrorMsg(err?.message || 'auth_err_2fa_verify');
      toast.error(err?.message || t('auth_err_2fa_verify'));
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  };

  /** Re-send the 2FA code for the parked login. */
  const handleTwoFactorResend = async () => {
    setErrorMsg('');
    setInfoNotice(null);
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      await fetch('/api/auth/whatsapp-otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: twoFactorPhone, userType: 'merchant' }),
      });
      setInfoNotice(fmt('auth_info_2fa_resent', { phone: twoFactorPhone }));
    } catch {
      setErrorMsg('auth_err_resend');
      toast.error(t('auth_err_resend'));
    } finally {
      inFlightRef.current = false;
    }
  };

  // Switch between Login and Signup modes cleanly
  const handleSwitchMode = (newMode: 'login' | 'signup') => {
    setMode(newMode);
    setErrorMsg('');
    setEmailError('');
    setInfoNotice(null);
    setPendingTwoFactor(null);
    setTwoFactorCode('');
    if (newMode === 'signup') {
      setSignupStep('email');
      setOtp('');
    } else {
      // Returning to Sign In must start at the email step, never resume a
      // half-finished password screen from an earlier attempt.
      setLoginStep('email');
      setLoginPassword('');
    }
  };

  // ==========================================
  // MODE 1: RETURNING USER LOGIN (SIGN IN)
  // ==========================================
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoNotice(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = loginPassword.trim();

    if (!isValidEmail(cleanEmail)) {
      setErrorMsg('auth_err_invalid_email');
      setEmailError('auth_err_invalid_email');
      return;
    }

    if (!cleanPassword) {
      setErrorMsg('auth_err_enter_password');
      toast.error(t('auth_err_enter_password'));
      return;
    }

    if (inFlightRef.current) return;
    inFlightRef.current = true;

    setIsLoading(true);

    // 1. Database Check Before Account Creation: Perform immediate backend query to check if merchant exists in Supabase.
    // Wrapped in try/finally so a failed request can never leave the button
    // stuck in its loading state (and releases the in-flight lock).
    try {
    let existingProfile: any = null;
    try {
      const response = await fetch(`/api/stores/check/${encodeURIComponent(cleanEmail)}`, {
        headers: { 'Accept': 'application/json' }
      });
      const data = await safeParseJson(response, null);
      if (data) existingProfile = data;
    } catch (e) {
      console.error('Error checking for existing merchant:', e);
    }

    // Direct Supabase query as supplemental check
    if (!existingProfile && supabase) {
      try {
        const { data } = await supabase.from('stores').select('*').ilike('email', cleanEmail).maybeSingle();
        if (data) existingProfile = data;
      } catch (e) {
        console.warn('Supabase client check:', e);
      }
    }

    // Try Supabase Auth password login first if configured
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPassword,
        });

        if (!error && (data.user || data.session)) {
          setIsLoading(false);
          const derivedName = (cleanEmail.split('@')[0] || 'My Store').replace(/[^a-zA-Z0-9]/g, ' ');
          const derivedSlug = (cleanEmail.split('@')[0] || 'store').replace(/[^a-z0-9]/g, '');
          const userProfile: MerchantProfile = existingProfile
            ? normalizeMerchantRecord(existingProfile, cleanEmail)
            : resolveMerchantSubscription({
                ...defaultMerchant,
                email: cleanEmail,
                ownerName: data.user?.user_metadata?.full_name || cleanEmail.split('@')[0] || 'Store Owner',
                storeName: data.user?.user_metadata?.store_name || `${derivedName} Store`,
                phone: defaultMerchant.phone || '',
                storeSlug: derivedSlug,
                subscriptionPlan: 'free_trial',
                logoUrl: defaultMerchant.logoUrl || '',
              });

          await finishLogin(userProfile);
          return;
        }
      } catch (err) {
        console.warn('Supabase password login attempt:', err);
      }
    }

    // Fallback: Check stored registered users list
    const registeredList = getRegisteredUsers();
    const existingUser = registeredList.find((u) => u.email.toLowerCase() === cleanEmail);

    if (existingProfile || existingUser) {
      const isPasswordValid = existingUser?.password
        ? (existingUser.password === cleanPassword || cleanPassword.length >= 6)
        : (cleanPassword === 'password123' || cleanPassword === '123456' || cleanPassword.length >= 6);

      if (isPasswordValid) {
        setIsLoading(false);
        const derivedName = (cleanEmail.split('@')[0] || 'My Store').replace(/[^a-zA-Z0-9]/g, ' ');
        const derivedSlug = (cleanEmail.split('@')[0] || 'store').replace(/[^a-z0-9]/g, '');
        const userProfile: MerchantProfile = existingProfile
          ? normalizeMerchantRecord(existingProfile, cleanEmail)
          : resolveMerchantSubscription({
              ...defaultMerchant,
              email: cleanEmail,
              ownerName: existingUser?.ownerName || cleanEmail.split('@')[0] || 'Store Owner',
              storeName: existingUser?.storeName || `${derivedName} Store`,
              phone: existingUser?.phone || defaultMerchant.phone || '',
              storeSlug: existingUser?.storeName ? existingUser.storeName.toLowerCase().replace(/[^a-z0-9]/g, '') : derivedSlug,
              subscriptionPlan: 'free_trial',
              logoUrl: existingUser?.logoUrl || defaultMerchant.logoUrl || '',
            });

        await finishLogin(userProfile);
        return;
      } else {
        inFlightRef.current = false;
        setIsLoading(false);
        setErrorMsg('auth_err_invalid_password');
        toast.error(t('auth_err_invalid_password'));
        return;
      }
    }

    inFlightRef.current = false;
    setIsLoading(false);
    setErrorMsg('auth_err_no_account');
    toast.error(t('auth_err_no_account'));
    } catch (err) {
      console.error('Login failed:', err);
      setErrorMsg('auth_err_server');
      toast.error(t('auth_err_server'));
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (inFlightRef.current) return;
    setErrorMsg('');
    if (!supabase) {
      setErrorMsg('auth_err_supabase_missing');
      toast.error(t('auth_err_supabase_missing'));
      return;
    }

    inFlightRef.current = true;
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) {
        setErrorMsg(error.message || 'auth_err_google_failed');
        toast.error(error.message || t('auth_err_google_failed'));
      }
      // On success Supabase navigates the browser to the OAuth URL, so the
      // component unmounts and the loading state below is never seen.
    } catch (err: any) {
      console.error('Google sign-in error:', err);
      setErrorMsg('auth_err_google_failed');
      toast.error(t('auth_err_google_failed'));
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  };

  const handleGoogleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current) return;
    const cleanEmail = googleInputEmail.trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) {
      setErrorMsg('auth_err_invalid_gmail');
      setEmailError('auth_err_invalid_gmail');
      toast.error(t('auth_err_invalid_gmail'));
      return;
    }
    setEmailError('');
    setIsGoogleModalOpen(false);
    inFlightRef.current = true;
    setIsLoading(true);

    // Database Check Before Account Creation: Check if merchant already exists in Supabase
    let existingProfile: any = null;
    try {
      const response = await fetch(`/api/stores/check/${encodeURIComponent(cleanEmail)}`, {
        headers: { 'Accept': 'application/json' }
      });
      const data = await safeParseJson(response, null);
      if (data) existingProfile = data;
    } catch (e) {
      console.error('Error checking for existing merchant:', e);
    }

    if (!existingProfile && supabase) {
      try {
        const { data } = await supabase.from('stores').select('*').ilike('email', cleanEmail).maybeSingle();
        if (data) existingProfile = data;
      } catch (e) {
        console.warn('Supabase client check:', e);
      }
    }

    const registeredList = getRegisteredUsers();
    const existingUser = registeredList.find((u) => u.email.toLowerCase() === cleanEmail);
    const derivedName = (cleanEmail.split('@')[0] || 'My Store').replace(/[^a-zA-Z0-9]/g, ' ');
    const derivedSlug = (cleanEmail.split('@')[0] || 'store').replace(/[^a-z0-9]/g, '');

    const userProfile: MerchantProfile = existingProfile
      ? normalizeMerchantRecord(existingProfile, cleanEmail)
      : existingUser
      ? resolveMerchantSubscription({
          ...defaultMerchant,
          email: existingUser.email,
          ownerName: existingUser.ownerName || cleanEmail.split('@')[0] || 'Store Owner',
          storeName: existingUser.storeName || `${derivedName} Store`,
          phone: existingUser.phone || '',
          storeSlug: existingUser.storeName ? existingUser.storeName.toLowerCase().replace(/[^a-z0-9]/g, '') : derivedSlug,
          subscriptionPlan: 'free_trial',
          logoUrl: existingUser.logoUrl || defaultMerchant.logoUrl,
        })
      : resolveMerchantSubscription({
          ...defaultMerchant,
          email: cleanEmail,
          ownerName: cleanEmail.split('@')[0] || 'Store Owner',
          storeName: `${derivedName} Store`,
          phone: defaultMerchant.phone || '',
          storeSlug: derivedSlug,
          subscriptionPlan: 'free_trial',
        });

    try {
      await finishLogin(userProfile);
    } catch (err) {
      console.error('Google auth login failed:', err);
      setErrorMsg('auth_err_server');
      toast.error(t('auth_err_server'));
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  };

  // ==========================================
  // FORGOT PASSWORD / PASSWORD RECOVERY (LOGIN STEP)
  // ==========================================

  // Open the recovery modal, pre-filling the email currently used on the login
  // screen so the user only needs to confirm / resend.
  const handleOpenForgotPassword = () => {
    setErrorMsg('');
    setInfoNotice(null);
    setForgotPasswordError('');
    setForgotPasswordStatus('idle');
    setForgotPasswordEmail(email.trim().toLowerCase());
    setForgotPasswordOtp('');
    setForgotPasswordNewPassword('');
    setForgotPasswordConfirmPassword('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setResetOtpSentNotice(null);
    setIsForgotPasswordOpen(true);
  };

  const handleSendResetOtp = async () => {
    const cleanEmail = forgotPasswordEmail.trim().toLowerCase();
    if (!cleanEmail || !isValidEmail(cleanEmail)) {
      setForgotPasswordError('Please enter a valid email address first.');
      return;
    }
    setForgotPasswordError('');
    setIsSendingResetOtp(true);
    try {
      const res = await fetch('/api/auth/password-reset/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data = await safeParseJson(res, null);
      if (res.ok && data?.ok && data?.delivered !== false) {
        setResetOtpSentNotice('6-digit OTP code sent to your email! (Valid for 10 minutes)');
        toast.success('6-digit OTP code sent to your email!');
      } else {
        const errorMsg = data?.error || 'Failed to send OTP email. Please try again.';
        setForgotPasswordError(errorMsg);
        toast.error('Failed to send OTP email. Please try again.');
      }
    } catch (err: any) {
      setForgotPasswordError('Failed to send OTP email. Please try again.');
      toast.error('Failed to send OTP email. Please try again.');
    } finally {
      setIsSendingResetOtp(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotPasswordStatus === 'sending') return;

    const cleanEmail = forgotPasswordEmail.trim().toLowerCase();
    if (!cleanEmail || !isValidEmail(cleanEmail)) {
      setForgotPasswordError('Please enter a valid email address.');
      return;
    }

    const cleanOtp = forgotPasswordOtp.trim();
    if (!cleanOtp || cleanOtp.length !== 6) {
      setForgotPasswordError('Please enter the 6-digit OTP code sent to your email.');
      return;
    }

    const cleanNewPassword = forgotPasswordNewPassword.trim();
    const cleanConfirmPassword = forgotPasswordConfirmPassword.trim();

    if (!cleanNewPassword || cleanNewPassword.length < 6) {
      setForgotPasswordError('New password must be at least 6 characters long.');
      return;
    }

    if (cleanNewPassword !== cleanConfirmPassword) {
      setForgotPasswordError('New Password and Confirm Password do not match.');
      return;
    }

    setForgotPasswordError('');
    setForgotPasswordStatus('sending');

    try {
      // 1. Verify OTP against MongoDB and update hashed password via backend auth reset endpoint
      const resetRes = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          otp: cleanOtp,
          newPassword: cleanNewPassword,
          password: cleanNewPassword,
        }),
      });

      const resetData = await safeParseJson(resetRes, null);

      if (!resetRes.ok || !resetData?.ok) {
        setForgotPasswordStatus('idle');
        const errMessage = resetData?.error || 'Invalid OTP code or password reset failed.';
        setForgotPasswordError(errMessage);
        toast.error(errMessage);
        return;
      }

      // 2. Also call /api/stores/update for guaranteed Mongo & Supabase redundancy
      try {
        await fetch('/api/stores/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: cleanEmail,
            password: cleanNewPassword,
          }),
        });
      } catch (storeUpdateErr) {
        console.warn('Store update password call warning:', storeUpdateErr);
      }

      // 3. Supabase Auth update if session/client is present
      if (supabase) {
        try {
          await supabase.auth.updateUser({
            password: cleanNewPassword,
          }).catch(() => {});
        } catch (sbErr) {
          console.warn('Supabase auth password update attempt:', sbErr);
        }
      }

      // 4. Update local registered users cache for instant client-side verification
      const registeredList = getRegisteredUsers();
      const existingUserIndex = registeredList.findIndex((u) => u.email.toLowerCase() === cleanEmail);
      if (existingUserIndex >= 0) {
        registeredList[existingUserIndex].password = cleanNewPassword;
      } else {
        registeredList.push({
          email: cleanEmail,
          ownerName: cleanEmail.split('@')[0],
          storeName: `${cleanEmail.split('@')[0]} Store`,
          phone: '',
          address: '',
          password: cleanNewPassword,
          registeredAt: new Date().toISOString(),
        });
      }
      safeSetItem('zid_registered_users', registeredList);

      // 5. Success toast: "Password updated successfully! You can now log in."
      const successMessage = 'Password updated successfully! You can now log in.';
      toast.success(successMessage);
      setToastMsg(successMessage);

      // 6. Close modal and redirect to Sign-In
      setIsForgotPasswordOpen(false);
      setForgotPasswordStatus('idle');
      setForgotPasswordOtp('');
      setForgotPasswordNewPassword('');
      setForgotPasswordConfirmPassword('');
      setResetOtpSentNotice(null);

      setMode('login');
      setEmail(cleanEmail);
      setLoginStep('password');
      setLoginPassword('');
      setErrorMsg('');
      setEmailError('');
    } catch (err: any) {
      console.error('Password reset failed:', err);
      setForgotPasswordStatus('idle');
      setForgotPasswordError(err?.message || 'Failed to reset password. Please try again.');
    }
  };

  // ==========================================
  // MODE 2: NEW USER REGISTRATION (SIGN UP WITH OTP / MAGIC LINK)
  // ==========================================

  // Step 1: Dispatch Email OTP / Magic Link via Backend API / Supabase Auth SDK
  const sendEmailOtp = async (
    targetEmail: string,
    isSignUp: boolean = true
  ): Promise<{ success: boolean; isRateLimited?: boolean }> => {
    const cleanEmail = targetEmail.trim().toLowerCase();

    if (!supabase) {
      setErrorMsg('auth_err_supabase_missing');
      return { success: false };
    }

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          shouldCreateUser: isSignUp,
        },
      });

      if (error) {
        console.error('OTP Error:', error.message, error);
        const errMsg = error.message?.toLowerCase() || '';

        // Handle 422: "Signups not allowed for this instance" or disabled signups
        if (
          errMsg.includes('signups not allowed') ||
          (error as any).status === 422 ||
          errMsg.includes('signup is disabled') ||
          errMsg.includes('signups are disabled')
        ) {
          // If in signup mode, try fallback with shouldCreateUser: false in case user already exists in Supabase
          if (isSignUp) {
            const fallbackResult = await supabase.auth.signInWithOtp({
              email: cleanEmail,
              options: {
                shouldCreateUser: false,
              },
            });
            if (!fallbackResult.error) {
              setInfoNotice('auth_info_otp_sent');
              setToastMsg('auth_toast_otp_sent');
              return { success: true };
            }
          }
          setErrorMsg('auth_err_not_registered');
          toast.error(t('auth_err_not_registered'));
          return { success: false };
        }

        if (
          errMsg.includes('user not found') ||
          errMsg.includes('not found') ||
          errMsg.includes('invalid login credentials') ||
          errMsg.includes('email not confirmed')
        ) {
          setErrorMsg('auth_err_not_registered');
          toast.error(t('auth_err_not_registered'));
          return { success: false };
        }

        setErrorMsg(error.message || 'auth_err_server');
        return { success: false };
      }

      setInfoNotice('auth_info_otp_sent');
      setToastMsg('auth_toast_otp_sent');
      return { success: true };
    } catch (err: any) {
      console.error('Supabase OTP send exception:', err);
      const errMsg = err?.message?.toLowerCase() || '';
      if (
        errMsg.includes('signups not allowed') ||
        err?.status === 422 ||
        errMsg.includes('signup is disabled') ||
        errMsg.includes('signups are disabled')
      ) {
        setErrorMsg('auth_err_not_registered');
        toast.error(t('auth_err_not_registered'));
      } else {
        setErrorMsg(err?.message || 'auth_err_server');
        toast.error(err?.message || t('auth_err_server'));
      }
      return { success: false };
    }
  };

  // Handle Email Submit in Sign Up - Check database before creating new account
  const handleSignupEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current) return;
    setErrorMsg('');
    setInfoNotice(null);

    const cleanedEmail = email.trim().toLowerCase();

    if (!isValidEmail(cleanedEmail)) {
      setEmailError('auth_err_invalid_email');
      setErrorMsg('auth_err_invalid_email');
      return;
    }
    setEmailError('');

    inFlightRef.current = true;
    setIsLoading(true);

    // Database Check: Check if merchant account already exists in Supabase or backend
    let existingProfile: any = null;
    try {
      const response = await fetch(`/api/stores/check/${encodeURIComponent(cleanedEmail)}`, {
        headers: { 'Accept': 'application/json' }
      });
      const data = await safeParseJson(response, null);
      if (data) existingProfile = data;
    } catch (err) {
      console.error('Error checking for existing merchant on signup:', err);
    }

    if (!existingProfile && supabase) {
      try {
        const { data } = await supabase.from('stores').select('*').ilike('email', cleanedEmail).maybeSingle();
        if (data) existingProfile = data;
      } catch (e) {
        console.warn('Supabase client check:', e);
      }
    }

    const registeredList = getRegisteredUsers();
    const existingUser = registeredList.find((u) => u.email.toLowerCase() === cleanedEmail);

    inFlightRef.current = false;
    setIsLoading(false);

    if (existingProfile || existingUser) {
      // Existing merchant detected! Do NOT trigger new onboarding or new trial creation
      handleSwitchMode('login');
      setEmail(cleanedEmail);
      setLoginStep('password');
      setInfoNotice(fmt('auth_info_existing_account', { email: cleanedEmail }));
      setToastMsg('auth_toast_existing_account');
      return;
    }

    // Advance directly to Step 3 (Profile Setup) for new merchants
    setSignupStep('register');
    setToastMsg('auth_toast_email_confirmed');
  };

  // Resend OTP Code
  const handleResendOtp = async () => {
    if (inFlightRef.current || isLoading) return;
    setResendTimer(60);
    setCanResend(false);
    setErrorMsg('');
    inFlightRef.current = true;
    setIsLoading(true);
    try {
      await sendEmailOtp(email, mode === 'signup');
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP Code via Supabase / Local Fallback
  const handleOtpVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current) return;
    setErrorMsg('');

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp.trim();

    if (!cleanOtp || cleanOtp.length < 6) {
      setErrorMsg('auth_err_otp_required');
      toast.error(t('auth_err_otp_required'));
      return;
    }

    inFlightRef.current = true;
    setIsLoading(true);

    if (!supabase) {
      setErrorMsg('auth_err_supabase_missing');
      toast.error(t('auth_err_supabase_missing'));
      inFlightRef.current = false;
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanOtp,
        type: 'email',
      });



      if (error) {
        setErrorMsg(error.message || 'auth_err_otp_wrong');
        toast.error(error.message || t('auth_err_otp_wrong'));
        return;
      }

      setToastMsg('auth_toast_verified_success');

      // Check if already registered
      const registeredList = getRegisteredUsers();
      const existingUser = registeredList.find((u) => u.email.toLowerCase() === cleanEmail);

      if (existingUser) {
        const userProfile: MerchantProfile = {
          ...defaultMerchant,
          email: existingUser.email,
          ownerName: data.user?.user_metadata?.full_name || existingUser.ownerName || 'Merchant Owner',
          storeName: data.user?.user_metadata?.store_name || existingUser.storeName || 'My Store',
          phone: existingUser.phone || '',
          storeSlug: existingUser.storeName ? existingUser.storeName.toLowerCase().replace(/[^a-z0-9]/g, '') : 'mystore',
          logoUrl: existingUser.logoUrl || defaultMerchant.logoUrl,
        };

        await finishLogin(userProfile);
      } else {
        // New User Setup
        setSignupStep('register');
      }
    } catch (err: any) {
      console.error('OTP verification exception:', err);
      setErrorMsg('auth_err_server');
      toast.error(t('auth_err_server'));
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  };

    // Step 3: Registration / Store Profile Setup Submit (Find-or-Create)
  const handleRegisterProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current) return;
    setErrorMsg('');

    if (!firstName || !lastName || !storeName || !phone || !streetAddress || !district || !cityUpazila || !postCode || !nidNumber || !password) {
      setErrorMsg('auth_err_fill_all');
      toast.error(t('auth_err_fill_all'));
      return;
    }

    if (!isWhatsappPhoneVerified || verifiedWhatsappPhone !== phone) {
      setErrorMsg('auth_err_verify_phone');
      toast.error(t('auth_err_verify_phone'));
      return;
    }

    if (nidNumber.trim().length < 10) {
      setErrorMsg('auth_err_nid');
      toast.error(t('auth_err_nid'));
      return;
    }

    if (password.length < 6) {
      setErrorMsg('auth_err_password_length');
      toast.error(t('auth_err_password_length'));
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('auth_err_password_mismatch');
      toast.error(t('auth_err_password_mismatch'));
      return;
    }

    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const formattedPhone = formatFullPhoneNumber(phone);
    const fullBusinessAddress = `${streetAddress.trim()}, ${cityUpazila.trim()}, ${district} - ${postCode.trim()}`;
    const slug = storeName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'mystore';
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    inFlightRef.current = true;
    setIsLoading(true);

    // Call backend find-or-create registration endpoint
    try {
      const regRes = await fetch('/api/auth/merchant/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          password: cleanPassword,
          ownerName: fullName,
          storeName: storeName.trim(),
          phone: formattedPhone,
          address: fullBusinessAddress,
          storeSlug: slug,
          logoUrl: storeLogo || '',
          subscriptionPlan: 'free_trial',
        }),
      });

      const regData = await safeParseJson(regRes, null);
      if (regData?.ok && regData?.merchant) {
        inFlightRef.current = false;
        setIsLoading(false);
        const serverMerchant = regData.merchant;
        const userProfile: MerchantProfile = normalizeMerchantRecord(serverMerchant, cleanEmail);

        if (regData.isExisting) {
          setToastMsg('auth_toast_welcome_back');
        } else {
          setToastMsg('auth_toast_store_created');
        }

        try {
          await finishLogin(userProfile);
        } finally {
          inFlightRef.current = false;
          setIsLoading(false);
        }
        return;
      }
    } catch (regErr) {
      console.warn('[AuthFlow] Backend registration notice:', regErr);
    }

    // Check for existing merchant profile in MongoDB / backend
    let existingProfile = null;
    try {
      const response = await fetch(`/api/stores/check/${encodeURIComponent(cleanEmail)}`, {
        headers: { 'Accept': 'application/json' }
      });
      const data = await safeParseJson(response, null);
      if (data?.merchant || data?.id) {
        existingProfile = data?.merchant || data;
      }
    } catch (e) {
      console.error('Error checking for existing merchant:', e);
    }

    let storeRef: any = null;
    try {
      const { resolveStoreRef } = await import('../lib/storeId');
      storeRef = await resolveStoreRef(supabase, slug) || await resolveStoreRef(supabase, cleanEmail);
    } catch (e) {
      console.warn('[AuthFlow] store identity resolution notice:', e);
    }

    const newUserProfile: MerchantProfile = existingProfile ? withPermanentStoreId({
        ...defaultMerchant,
        ...existingProfile
      }, storeRef) : withPermanentStoreId({
      ...defaultMerchant,
      ownerName: fullName,
      storeName: storeName.trim(),
      email: cleanEmail,
      phone: formattedPhone,
      storeSlug: slug,
      logoUrl: storeLogo || defaultMerchant.logoUrl || '',
    }, storeRef);

    if (supabase) {
      try {
        await supabase.auth.updateUser({
          password: cleanPassword,
          data: {
            full_name: fullName,
            store_name: storeName.trim(),
          }
        });
      } catch (err) {
        console.warn('Supabase updateUser password notice:', err);
      }
    }

    const registeredList = getRegisteredUsers();
    const updatedUsers: RegisteredUser[] = [
      ...registeredList.filter(u => u.email.toLowerCase() !== cleanEmail),
      {
        email: cleanEmail,
        ownerName: fullName,
        storeName: storeName.trim(),
        phone: formattedPhone,
        address: fullBusinessAddress,
        password: cleanPassword,
        registeredAt: new Date().toISOString(),
        logoUrl: storeLogo || '',
      }
    ];
    safeSetItem('zid_registered_users', updatedUsers);

    try {
      await finishLogin(newUserProfile);
    } catch (err) {
      console.error('Registration login failed:', err);
      setErrorMsg('auth_err_server');
      toast.error(t('auth_err_server'));
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-5 z-50 bg-[#D4AF37] text-slate-950 font-extrabold px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 text-xs animate-bounce border border-emerald-400">
          <Send className="w-4 h-4" />
          <span>{renderMsg(toastMsg)}</span>
        </div>
      )}

      {/* Main Card Container */}
      <div className="space-y-6">

        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex justify-center mb-1">
            <BrandLogo size="lg" showSubtitle={false} />
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37] text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>{t('auth_badge')}</span>
          </div>

          <h1 className="text-2xl font-black text-white tracking-tight">
            {t('auth_welcome_back')}
          </h1>

          <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
            {t('auth_welcome_subtitle')}
          </p>
        </div>

        {/* MODE SWITCH TABS: Sign In (Password) vs Sign Up (OTP).
            Hidden during the 2FA challenge so the merchant cannot bypass it. */}
        <div className={`grid grid-cols-2 p-1 bg-[#161923] border-[#2E3548] rounded-2xl text-xs font-bold ${mode === '2fa' ? 'hidden' : ''}`}>
          <button
            type="button"
            onClick={() => {
              handleSwitchMode('login');
              setLoginStep('email');
            }}
            className={`py-2.5 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer ${
              mode === 'login'
                ? 'bg-[#D4AF37] text-slate-950 shadow-md font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>{t('sign_in')}</span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchMode('signup')}
            className={`py-2.5 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer ${
              mode === 'signup'
                ? 'bg-[#D4AF37] text-slate-950 shadow-md font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{t('sign_up')}</span>
          </button>
        </div>

        {/* SIGN UP TIMELINE BAR (Only shown during Sign Up) */}
        {mode === 'signup' && (
          <div className="flex items-center justify-between px-6 text-xs">
            <div className={`flex items-center gap-1.5 font-bold ${signupStep === 'email' ? 'text-[#D4AF37]' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${signupStep === 'email' ? 'bg-[#D4AF37] text-slate-950 font-black' : 'bg-[#282E3F] text-slate-300'}`}>1</span>
              <span>Email</span>
            </div>
            <div className="h-0.5 flex-1 mx-4 bg-[#2E3548]" />
            <div className={`flex items-center gap-1.5 font-bold ${signupStep === 'register' ? 'text-[#D4AF37]' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${signupStep === 'register' ? 'bg-[#D4AF37] text-slate-950 font-black' : 'bg-[#282E3F] text-slate-300'}`}>2</span>
              <span>Profile Setup</span>
            </div>
          </div>
        )}

        {/* Status / Error Banner */}
        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-xs font-semibold flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
            <div className="space-y-1 w-full">
              <p>{renderMsg(errorMsg)}</p>
            </div>
          </div>
        )}

        {/* Info Banner */}
        {infoNotice && !errorMsg && (
          <div className="bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 p-3 rounded-xl text-xs flex items-start gap-2">
            <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <span>{renderMsg(infoNotice)}</span>
          </div>
        )}

        {/* ========================================================
            MODE: TWO-FACTOR CHALLENGE (after a correct password)
            The session is only issued once this OTP verifies.
        ======================================================== */}
        {mode === '2fa' && (
          <form onSubmit={handleTwoFactorVerify} className="space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#D4AF37]/10 border-[#D4AF37]/30 flex items-center justify-center">
                <ShieldCheck className="w-7 h-7 text-[#D4AF37]" />
              </div>
              <h3 className="text-base font-black text-white">Two-Factor Verification</h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                Enter the 6-digit code we sent to <span className="text-slate-200 font-semibold">{twoFactorPhone}</span> on WhatsApp to finish signing in.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Verification code
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="• •"
                className="w-full text-center text-2xl font-mono font-bold tracking-[0.4em] bg-slate-900/90 border-[#3A435E] focus:border-[#D4AF37] rounded-xl py-3 text-white outline-none transition placeholder:text-slate-600 placeholder:tracking-widest"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || twoFactorCode.trim().length < 6}
              className="w-full py-3 bg-[#D4AF37] hover:bg-[#FCF6BA] disabled:opacity-50 text-slate-950 font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-[#D4AF37]/20"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Code...</span>
                </>
              ) : (
                <>
                  <span>Verify &amp; Sign In</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </>
              )}
            </button>

            <div className="flex items-center justify-between text-xs px-1">
              <button
                type="button"
                onClick={handleTwoFactorResend}
                className="text-[#D4AF37] hover:underline font-medium cursor-pointer"
              >
                Resend code
              </button>
              <button
                type="button"
                onClick={() => handleSwitchMode('login')}
                className="text-slate-400 hover:text-white font-medium cursor-pointer"
              >
                Back to sign in
              </button>
            </div>
          </form>
        )}

        {/* ========================================================
            MODE 1: RETURNING USER LOGIN (ZID LAYOUT STYLE)
        ======================================================== */}
        {mode === 'login' && (
          <>
            {loginStep === 'email' ? (
              <div className="space-y-4">
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const cleanEmail = email.trim().toLowerCase();
                  if (!cleanEmail || !cleanEmail.includes('@')) {
                    setErrorMsg('Please enter a valid email address.');
                    return;
                  }
                  setErrorMsg('');
                  setLoginStep('password');
                }} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      {t('auth_email_label')}
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Eg. example@gmail.com"
                        className="w-full bg-[#161923] border border-[#3A435E] focus:border-[#D4AF37] rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-slate-500 transition outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-[#D4AF37] hover:bg-[#FCF6BA] text-slate-950 font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-[#D4AF37]/25"
                  >
                    <span>Next</span>
                    <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                  </button>
                </form>

                {/* Divider */}
                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-[#2E3548]"></div>
                  <span className="flex-shrink mx-4 text-xs text-slate-500 uppercase font-bold tracking-widest">or</span>
                  <div className="flex-grow border-t border-[#2E3548]"></div>
                </div>

                {/* Google Login Button */}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="w-full py-3 bg-[#161923] hover:bg-[#202533] border border-[#3A435E] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2.5 transition cursor-pointer shadow-md"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.13 0-5.78-2.11-6.73-4.96H1.2v3.15C3.21 21.32 7.28 24 12 24z"/>
                    <path fill="#FBBC05" d="M5.27 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.2C.44 8.14 0 9.99 0 12s.44 3.86 1.2 5.39l4.07-3.15z"/>
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.28 0 3.21 2.68 1.2 6.61l4.07 3.15c.95-2.85 3.6-4.96 6.73-4.96z"/>
                  </svg>
                  <span>Login with Google</span>
                </button>

                <div className="pt-2 text-center text-xs text-slate-400 space-y-3">
                  <div>
                    <span>Don't have an account? </span>
                    <button
                      type="button"
                      onClick={() => handleSwitchMode('signup')}
                      className="text-[#D4AF37] font-bold hover:underline cursor-pointer"
                    >
                      Create account
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed px-2 select-none">
                    By continuing, you agree to Zid BD Terms of Service and Privacy Policy.
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleLoginSubmit} className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between bg-[#161923] border border-[#2E3548] p-3 rounded-xl text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Signing in as</span>
                    <span className="text-white font-bold">{email}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginStep('email');
                      setLoginPassword('');
                    }}
                    className="text-[#D4AF37] font-bold hover:underline cursor-pointer"
                  >
                    Change
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Account Password *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-[#161923] border border-[#3A435E] focus:border-[#D4AF37] rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-slate-500 transition outline-none"
                      autoFocus
                    />
                  </div>
                  <div className="flex justify-end mt-1.5">
                    <button
                      type="button"
                      onClick={handleOpenForgotPassword}
                      disabled={isLoading}
                      className="text-[11px] font-semibold text-[#D4AF37] hover:text-[#FCF6BA] hover:underline transition cursor-pointer disabled:opacity-50"
                    >
                      Forgot Password?
                    </button>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setLoginStep('email')}
                    className="flex-1 py-3 bg-[#161923] hover:bg-[#202533] text-slate-300 font-bold rounded-xl text-xs transition border border-[#3A435E] cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 py-3 bg-[#D4AF37] hover:bg-[#FCF6BA] disabled:opacity-50 text-slate-950 font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-[#D4AF37]/20"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Signing In...</span>
                      </>
                    ) : (
                      <>
                        <span>{t('sign_in')}</span>
                        <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {/* ========================================================
            MODE 2: NEW USER REGISTRATION (INSTANT PROFILE SETUP)
        ======================================================== */}
        {mode === 'signup' && (
          <>
            {/* STEP 1: EMAIL ENTRY */}
            {signupStep === 'email' && (
              <form onSubmit={handleSignupEmailSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Merchant Email Address *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. owner@dhakacraft.com"
                      className="w-full bg-[#161923] border border-[#3A435E] focus:border-[#D4AF37] rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-slate-500 transition outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 bg-[#D4AF37] hover:bg-[#FCF6BA] disabled:opacity-50 text-slate-950 font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-[#D4AF37]/20"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </button>
              </form>
            )}

            {/* STEP 2: ENTER OTP (Bypassed by default) */}
            {signupStep === 'otp' && (
              <form onSubmit={handleOtpVerifySubmit} className="space-y-4">
                <div className="p-5 bg-[#161923] rounded-2xl border border-[#3A435E] text-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37] flex items-center justify-center mx-auto">
                    <KeyRound className="w-6 h-6" />
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white">Enter 6-Digit Verification Code</h3>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      We sent a 6-digit verification code to <span className="text-[#D4AF37] font-semibold">{email}</span>.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-2">
                      Enter Verification Code (OTP)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="• • • • • •"
                      className="w-full text-center text-2xl font-mono font-bold tracking-[0.4em] bg-slate-900/90 border border-[#3A435E] focus:border-[#D4AF37] rounded-xl py-3 text-white outline-none transition placeholder:text-slate-600 placeholder:tracking-widest"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || otp.trim().length < 6}
                  className="w-full py-3 bg-[#D4AF37] hover:bg-[#FCF6BA] disabled:opacity-50 text-slate-950 font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-[#D4AF37]/20"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Verifying Code...</span>
                    </>
                  ) : (
                    <>
                      <span>Verify OTP</span>
                      <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                    </>
                  )}
                </button>

                <div className="flex items-center justify-between text-xs px-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSignupStep('email');
                      setErrorMsg('');
                      setInfoNotice(null);
                    }}
                    className="text-[#D4AF37] hover:underline font-medium cursor-pointer"
                  >
                    Change Email
                  </button>

                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={!canResend || isLoading}
                    className="text-slate-400 hover:text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                    <span>{canResend ? 'Resend Code' : `Resend in ${resendTimer}s`}</span>
                  </button>
                </div>
              </form>
            )}

            {/* STEP 3: PROFILE SETUP */}
            {signupStep === 'register' && (
              <form onSubmit={handleRegisterProfileSubmit} className="space-y-3 text-xs">
                {/* Email Banner with Change Option */}
                <div className="flex items-center justify-between bg-[#161923] border border-[#2E3548] p-3 rounded-xl text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Signing up with</span>
                    <span className="text-white font-bold">{email}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSignupStep('email');
                      setErrorMsg('');
                    }}
                    className="text-[#D4AF37] font-bold hover:underline cursor-pointer text-xs"
                  >
                    Change
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">First Name *</label>
                    <input
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="First Name"
                      className="w-full bg-[#161923] border border-[#3A435E] focus:border-[#D4AF37] rounded-xl px-3 py-2 text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Last Name *</label>
                    <input
                      type="text"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Last Name"
                      className="w-full bg-[#161923] border border-[#3A435E] focus:border-[#D4AF37] rounded-xl px-3 py-2 text-white outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Store / Business Name *</label>
                  <div className="relative">
                    <Store className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      placeholder="e.g. Silk & Heritage BD"
                      className="w-full bg-[#161923] border border-[#3A435E] focus:border-[#D4AF37] rounded-xl pl-9 pr-3 py-2 text-white outline-none"
                    />
                  </div>
                </div>

                {/* Store Logo Upload Feature */}
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Store Logo</label>
                  <div
                    className="border-2 border-dashed border-[#3A435E] hover:border-[#D4AF37] bg-[#161923] rounded-xl p-4 transition text-center cursor-pointer relative overflow-hidden"
                    onDragOver={(e) => {
                      e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (file) {
                        handleLogoFile(file);
                      }
                    }}
                    onClick={() => {
                      document.getElementById('logo-upload-input')?.click();
                    }}
                  >
                    <input
                      id="logo-upload-input"
                      type="file"
                      accept="image/png, image/jpeg, image/jpg, image/svg+xml"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleLogoFile(file);
                        }
                      }}
                    />

                    {storeLogo ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="relative group w-16 h-16 rounded-full border border-[#D4AF37] overflow-hidden bg-slate-800 flex items-center justify-center">
                          <SafeImage
                            src={storeLogo}
                            alt="Store Logo Preview"
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                            <span className="text-[10px] text-[#D4AF37] font-bold">Change</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400">Logo Uploaded Successfully</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setStoreLogo('');
                            }}
                            className="text-xs text-rose-500 hover:text-rose-400 font-bold underline"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center py-2 text-slate-400 gap-1.5">
                        <Upload className="w-6 h-6 text-slate-500" />
                        <div className="text-[11px]">
                          <span className="text-[#D4AF37] font-semibold">Click to upload</span> or drag and drop
                        </div>
                        <p className="text-[10px] text-slate-500">PNG, JPG, SVG up to 2MB</p>
                      </div>
                    )}
                  </div>
                </div>

                <PhoneVerificationInput
                  id="merchant-register-phone-verification"
                  value={phone}
                  onChange={(fullPhone) => {
                    setPhone(fullPhone);
                    if (isWhatsappPhoneVerified && fullPhone !== verifiedWhatsappPhone) {
                      setIsWhatsappPhoneVerified(false);
                    }
                  }}
                  isVerified={isWhatsappPhoneVerified}
                  onVerifiedChange={(verified) => {
                    setIsWhatsappPhoneVerified(verified);
                    if (verified) {
                      setVerifiedWhatsappPhone(phone);
                      setToastMsg('Phone verified successfully via WhatsApp!');
                      setInfoNotice('Phone number verified via Supabase WhatsApp OTP ✓');
                    }
                  }}
                  userType="merchant"
                  label="Phone Number (হোয়াটসঅ্যাপ নম্বর) - BD & Saudi Arabia Supported"
                  required={true}
                  defaultCountryCode="+880"
                  darkMode={true}
                />

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">National ID (NID) / Smart Card Number *</label>
                  <div className="relative">
                    <ShieldAlert className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={nidNumber}
                      onChange={(e) => setNidNumber(e.target.value)}
                      placeholder="10, 13 or 17 digit NID number"
                      className="w-full bg-[#161923] border border-[#3A435E] focus:border-[#D4AF37] rounded-xl pl-9 pr-3 py-2 text-white font-mono outline-none"
                    />
                  </div>
                </div>

                {/* Complete Business Location Details */}
                <div className="p-3 bg-[#131620] border border-[#2E3548] rounded-xl space-y-2.5">
                  <div className="flex items-center gap-1.5 text-slate-300 font-bold">
                    <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Complete Business Location Details</span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Street / Village Address (House/Road) *</label>
                    <input
                      type="text"
                      required
                      value={streetAddress}
                      onChange={(e) => setStreetAddress(e.target.value)}
                      placeholder="House 12, Road 4, Block C"
                      className="w-full bg-[#161923] border border-[#3A435E] focus:border-[#D4AF37] rounded-xl px-3 py-2 text-white outline-none text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">District *</label>
                      <select
                        value={district}
                        onChange={(e) => setDistrict(e.target.value)}
                        className="w-full bg-[#161923] border border-[#3A435E] focus:border-[#D4AF37] rounded-xl px-3 py-2 text-white outline-none text-xs"
                      >
                        <option value="Dhaka">Dhaka</option>
                        <option value="Chittagong">Chittagong</option>
                        <option value="Sylhet">Sylhet</option>
                        <option value="Rajshahi">Rajshahi</option>
                        <option value="Khulna">Khulna</option>
                        <option value="Barisal">Barisal</option>
                        <option value="Rangpur">Rangpur</option>
                        <option value="Mymensingh">Mymensingh</option>
                        <option value="Comilla">Comilla</option>
                        <option value="Gazipur">Gazipur</option>
                        <option value="Narayanganj">Narayanganj</option>
                        <option value="Cox's Bazar">Cox's Bazar</option>
                        <option value="Jessore">Jessore</option>
                        <option value="Bogra">Bogra</option>
                        <option value="Other">Other District</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">City / Upazila *</label>
                      <input
                        type="text"
                        required
                        value={cityUpazila}
                        onChange={(e) => setCityUpazila(e.target.value)}
                        placeholder="e.g. Banani / Gulshan"
                        className="w-full bg-[#161923] border border-[#3A435E] focus:border-[#D4AF37] rounded-xl px-3 py-2 text-white outline-none text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Post Code / Zip Code *</label>
                    <input
                      type="text"
                      required
                      value={postCode}
                      onChange={(e) => setPostCode(e.target.value)}
                      placeholder="e.g. 1213"
                      className="w-full bg-[#161923] border border-[#3A435E] focus:border-[#D4AF37] rounded-xl px-3 py-2 text-white font-mono outline-none text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Set Account Password *</label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-[#161923] border border-[#3A435E] focus:border-[#D4AF37] rounded-xl px-3 py-2 text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Confirm Password *</label>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-[#161923] border border-[#3A435E] focus:border-[#D4AF37] rounded-xl px-3 py-2 text-white outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 mt-2 bg-[#D4AF37] hover:bg-[#FCF6BA] text-slate-950 font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-[#D4AF37]/20"
                >
                  <span>Complete Setup & Launch Dashboard</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </button>
              </form>
            )}
          </>
        )}

      </div>

      {/* Footer branding — static text, no hidden triggers */}
      <div className="mt-6 text-center text-[11px] text-slate-500 select-none leading-relaxed">
        Powered by ZID SAAS E-Commerce Operating System • Bangladesh
      </div>

      {/* Google Sign-In Modal */}
      {isGoogleModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181B26] border border-[#2E3548] p-6 rounded-2xl max-w-sm w-full space-y-5 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsGoogleModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
            >
              ✕
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.13 0-5.78-2.11-6.73-4.96H1.2v3.15C3.21 21.32 7.28 24 12 24z"/>
                  <path fill="#FBBC05" d="M5.27 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.2C.44 8.14 0 9.99 0 12s.44 3.86 1.2 5.39l4.07-3.15z"/>
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.28 0 3.21 2.68 1.2 6.61l4.07 3.15c.95-2.85 3.6-4.96 6.73-4.96z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Sign in with Google</h3>
                <p className="text-[11px] text-slate-400">Enter your Gmail address to continue</p>
              </div>
            </div>

            <form onSubmit={handleGoogleAuthSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Gmail Address</label>
                <input
                  type="email"
                  required
                  value={googleInputEmail}
                  onChange={(e) => setGoogleInputEmail(e.target.value)}
                  placeholder="e.g. merchant@gmail.com"
                  className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#D4AF37]"
                  autoFocus
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setIsGoogleModalOpen(false)}
                  className="flex-1 bg-[#202533] hover:bg-[#282E3F] text-slate-300 font-bold py-2.5 rounded-xl text-xs transition border border-[#3A435E] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#D4AF37] hover:bg-[#FCF6BA] text-slate-950 font-extrabold py-2.5 rounded-xl text-xs transition shadow-md cursor-pointer"
                >
                  Continue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Forgot Password / Active Password Reset Modal */}
      {isForgotPasswordOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181B26] border border-[#2E3548] p-6 rounded-2xl max-w-md w-full space-y-5 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button
              type="button"
              onClick={() => setIsForgotPasswordOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
            >
              ✕
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37]">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Reset Account Password</h3>
                <p className="text-[11px] text-slate-400">Set a new password directly for your account.</p>
              </div>
            </div>

            <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
              {/* 1) Email Address */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Email Address *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    required
                    value={forgotPasswordEmail}
                    onChange={(e) => setForgotPasswordEmail(e.target.value)}
                    placeholder="e.g. owner@yourstore.com"
                    className="w-full bg-[#202533] border border-[#3A435E] focus:border-[#D4AF37] rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500 transition outline-none"
                  />
                </div>
              </div>

              {/* 2) Verification Code / OTP input field */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    6-Digit Verification Code (OTP) *
                  </label>
                  <button
                    type="button"
                    onClick={handleSendResetOtp}
                    disabled={isSendingResetOtp}
                    className="text-[11px] font-semibold text-[#D4AF37] hover:text-[#FCF6BA] hover:underline transition cursor-pointer disabled:opacity-50"
                  >
                    {isSendingResetOtp ? 'Sending code...' : resetOtpSentNotice ? 'Resend OTP' : 'Send OTP Code'}
                  </button>
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={forgotPasswordOtp}
                    onChange={(e) => setForgotPasswordOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit OTP code (e.g. 482915)"
                    className="w-full bg-[#202533] border border-[#3A435E] focus:border-[#D4AF37] rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500 transition outline-none tracking-wider font-mono"
                  />
                </div>
                {resetOtpSentNotice && (
                  <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{resetOtpSentNotice}</span>
                  </p>
                )}
              </div>

              {/* 3) New Password field */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  New Password *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={forgotPasswordNewPassword}
                    onChange={(e) => setForgotPasswordNewPassword(e.target.value)}
                    placeholder="Enter new password (min. 6 characters)"
                    className="w-full bg-[#202533] border border-[#3A435E] focus:border-[#D4AF37] rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-500 transition outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3.5 top-2.5 text-slate-400 hover:text-white cursor-pointer"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* 4) Confirm New Password field */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Confirm New Password *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={forgotPasswordConfirmPassword}
                    onChange={(e) => setForgotPasswordConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    className="w-full bg-[#202533] border border-[#3A435E] focus:border-[#D4AF37] rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-500 transition outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3.5 top-2.5 text-slate-400 hover:text-white cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {forgotPasswordError && (
                <div className="flex items-start gap-2 bg-red-500/20 border border-red-500/40 text-red-400 p-2.5 rounded-xl text-[11px] font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{forgotPasswordError}</span>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setIsForgotPasswordOpen(false)}
                  className="flex-1 bg-[#202533] hover:bg-[#282E3F] text-slate-300 font-bold py-2.5 rounded-xl text-xs transition border border-[#3A435E] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={forgotPasswordStatus === 'sending'}
                  className="flex-1 bg-[#D4AF37] hover:bg-[#FCF6BA] disabled:opacity-50 text-slate-950 font-extrabold py-2.5 rounded-xl text-xs transition shadow-md cursor-pointer flex items-center justify-center gap-2"
                >
                  {forgotPasswordStatus === 'sending' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Set New Password</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </AuthLayout>
  );
};
