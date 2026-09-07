import React, { useState } from 'react';
import { BrandLogo } from './BrandLogo';
import {
  ShieldAlert,
  DollarSign,
  ShoppingBag,
  Users,
  CreditCard,
  CheckCircle,
  XCircle,
  Clock,
  Settings,
  Save,
  Search,
  Lock,
  Unlock,
  Plus,
  ArrowUpRight,
  Copy,
  Building2,
  Smartphone,
  Check,
  AlertCircle,
  LogIn as LogInIcon,
  UserCog,
  Ban,
  Wallet,
  CheckCircle2,
  Trash2,
  Palette,
  Eye,
  Layout,
  Pencil,
  MessageSquare,
  ShieldCheck,
  Send,
  History,
  LifeBuoy,
  Box,
  Cpu,
  Target,
  Globe,
  FileText,
  Download,
  AlertTriangle,
  Info,
  Radio,
  Mail,
  Zap,
  Bell,
  UserPlus,
  Key,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  MapPin,
  Coins,
  Percent,
  Facebook,
  MessageCircle,
  Image
} from 'lucide-react';
import { MerchantProfile, SubscriptionRequest, AdminPaymentGatewayConfig, AdminCustomGateway, ThemePurchaseRequest, SubscriptionPlanId, PlatformSettings, PlatformAnnouncement, SubscriptionPlan, PlatformTheme, SupportTicket, TicketMessage, PlatformAddon, AuditLog, PlatformSecuritySettings, BroadcastMessage, PlatformAutomationSettings, AdminTeamMember, AdminRolePermission } from '../types';
import { calculateSubscriptionExpiry, getPlanDurationInDays, calculateRemainingDays, getPlanDisplayName } from '../utils/subscriptionUtils';
import { supabase } from '../lib/supabase';

interface SuperAdminPortalViewProps {
  currentMerchant: MerchantProfile;
  onUpdateMerchant: (updated: MerchantProfile) => void;
  adminPaymentConfig: AdminPaymentGatewayConfig;
  onUpdateAdminPaymentConfig: (config: AdminPaymentGatewayConfig) => void;
  pendingRequests: SubscriptionRequest[];
  onUpdatePendingRequests: React.Dispatch<React.SetStateAction<SubscriptionRequest[]>>;
  themePurchaseRequests?: ThemePurchaseRequest[];
  onUpdateThemePurchaseRequests?: React.Dispatch<React.SetStateAction<ThemePurchaseRequest[]>>;
  allMerchants: MerchantProfile[];
  onUpdateAllMerchants: React.Dispatch<React.SetStateAction<MerchantProfile[]>>;
  onSwitchToMerchantPortal: () => void;
  onLoginAsMerchant: (merchant: MerchantProfile) => void;
  platformSettings: PlatformSettings;
  onUpdatePlatformSettings: (settings: PlatformSettings) => void;
  platformAnnouncement: PlatformAnnouncement;
  onUpdatePlatformAnnouncement: (announcement: PlatformAnnouncement) => void;
  platformPlans: SubscriptionPlan[];
  onUpdatePlatformPlans: (plans: SubscriptionPlan[]) => void;
  platformThemes: PlatformTheme[];
  onUpdatePlatformThemes: (themes: PlatformTheme[]) => void;
  supportTickets: SupportTicket[];
  onUpdateSupportTickets: React.Dispatch<React.SetStateAction<SupportTicket[]>>;
  platformAddons: PlatformAddon[];
  onUpdatePlatformAddons: (addons: PlatformAddon[]) => void;
  auditLogs: AuditLog[];
  onUpdateAuditLogs: React.Dispatch<React.SetStateAction<AuditLog[]>>;
  securitySettings: PlatformSecuritySettings;
  onUpdateSecuritySettings: React.Dispatch<React.SetStateAction<PlatformSecuritySettings>>;
  broadcastHistory: BroadcastMessage[];
  onUpdateBroadcastHistory: React.Dispatch<React.SetStateAction<BroadcastMessage[]>>;
  automationSettings: PlatformAutomationSettings;
  onUpdateAutomationSettings: React.Dispatch<React.SetStateAction<PlatformAutomationSettings>>;
  adminTeam: AdminTeamMember[];
  onUpdateAdminTeam: React.Dispatch<React.SetStateAction<AdminTeamMember[]>>;
  rolePermissions: AdminRolePermission[];
  onUpdateRolePermissions: React.Dispatch<React.SetStateAction<AdminRolePermission[]>>;
}

export const SuperAdminPortalView: React.FC<SuperAdminPortalViewProps> = ({
  currentMerchant,
  onUpdateMerchant,
  adminPaymentConfig,
  onUpdateAdminPaymentConfig,
  pendingRequests,
  onUpdatePendingRequests,
  themePurchaseRequests = [],
  onUpdateThemePurchaseRequests,
  allMerchants,
  onUpdateAllMerchants,
  onSwitchToMerchantPortal,
  onLoginAsMerchant,
  platformSettings,
  onUpdatePlatformSettings,
  platformAnnouncement,
  onUpdatePlatformAnnouncement,
  platformPlans,
  onUpdatePlatformPlans,
  platformThemes,
  onUpdatePlatformThemes,
  supportTickets,
  onUpdateSupportTickets,
  platformAddons,
  onUpdatePlatformAddons,
  auditLogs,
  onUpdateAuditLogs,
  securitySettings,
  onUpdateSecuritySettings,
  broadcastHistory,
  onUpdateBroadcastHistory,
  automationSettings,
  onUpdateAutomationSettings,
  adminTeam,
  onUpdateAdminTeam,
  rolePermissions,
  onUpdateRolePermissions
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'analytics' | 'gateways' | 'approvals' | 'merchants' | 'settings' | 'announcements' | 'plans' | 'themes' | 'support' | 'addons' | 'security' | 'broadcast' | 'team'>('analytics');
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  // New modal state for creating merchant
  const [isCreateMerchantModalOpen, setIsCreateMerchantModalOpen] = useState(false);
  const [newMerchantForm, setNewMerchantForm] = useState({
    storeName: '',
    email: '',
    plan: 'free_trial' as SubscriptionPlanId,
    expiryDays: 30
  });

  // Local state for platform settings form
  const [settingsForm, setSettingsForm] = useState<PlatformSettings>(platformSettings);
  const [announcementForm, setAnnouncementForm] = useState<PlatformAnnouncement>(platformAnnouncement);
  const [plansForm, setPlansForm] = useState<SubscriptionPlan[]>(platformPlans);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [memberForm, setMemberForm] = useState<Partial<AdminTeamMember>>({
    fullName: '',
    email: '',
    role: 'Support Lead',
    status: 'Active'
  });
  const [analyticsSummary, setAnalyticsSummary] = useState<string>('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [supportDraft, setSupportDraft] = useState<string>('');
  const [isGeneratingReply, setIsGeneratingReply] = useState(false);
  const [broadcastDraft, setBroadcastDraft] = useState<string>('');
  const [isGeneratingBroadcast, setIsGeneratingBroadcast] = useState(false);

  const handleOpenAddMember = () => {
    setEditingMemberId(null);
    setMemberForm({
      fullName: '',
      email: '',
      role: 'Support Lead',
      status: 'Active'
    });
    setIsTeamModalOpen(true);
  };

  const handleSaveMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingMemberId) {
      onUpdateAdminTeam(prev => prev.map(m => m.id === editingMemberId ? { ...m, ...memberForm } as AdminTeamMember : m));
      setSaveSuccess('Team member updated successfully.');
    } else {
      const newMember: AdminTeamMember = {
        id: `adm-${Date.now()}`,
        fullName: memberForm.fullName || '',
        email: memberForm.email || '',
        role: memberForm.role as any,
        lastActive: 'Never',
        status: memberForm.status as any
      };
      onUpdateAdminTeam(prev => [newMember, ...prev]);
      setSaveSuccess('New team member invited.');
    }
    setIsTeamModalOpen(false);
    setTimeout(() => setSaveSuccess(null), 3000);
  };

  const toggleMemberStatus = (id: string) => {
    onUpdateAdminTeam(prev => prev.map(m => m.id === id ? { ...m, status: m.status === 'Active' ? 'Inactive' : 'Active' } : m));
  };

  const handleTogglePermission = (role: string, tabId: string) => {
    onUpdateRolePermissions(prev => prev.map(rp => {
      if (rp.role === role) {
        const hasTab = rp.allowedTabs.includes(tabId);
        return {
          ...rp,
          allowedTabs: hasTab ? rp.allowedTabs.filter(t => t !== tabId) : [...rp.allowedTabs, tabId]
        };
      }
      return rp;
    }));
  };
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logSeverityFilter, setLogSeverityFilter] = useState<'All' | 'Info' | 'Warning' | 'Critical'>('All');

  // Broadcast State
  const [broadcastForm, setBroadcastForm] = useState<Partial<BroadcastMessage>>({
    audience: 'All Merchants',
    subject: '',
    type: 'Both',
    body: ''
  });

  const handleSendBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastForm.subject || !broadcastForm.body) return;

    const newBroadcast: BroadcastMessage = {
      id: `bc-${Date.now()}`,
      timestamp: new Date().toISOString(),
      audience: broadcastForm.audience as any,
      subject: broadcastForm.subject,
      type: broadcastForm.type as any,
      body: broadcastForm.body,
      status: 'Delivered'
    };

    onUpdateBroadcastHistory([newBroadcast, ...broadcastHistory]);
    setBroadcastForm({
      audience: 'All Merchants',
      subject: '',
      type: 'Both',
      body: ''
    });
    setSaveSuccess('Broadcast sent successfully to ' + newBroadcast.audience);
    setTimeout(() => setSaveSuccess(null), 3000);
  };

  const filteredLogs = auditLogs.filter(log => {
    const matchesSearch =
      log.action.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
      log.targetEntity.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
      log.adminUser.toLowerCase().includes(logSearchQuery.toLowerCase());
    const matchesSeverity = logSeverityFilter === 'All' || log.severity === logSeverityFilter;
    return matchesSearch && matchesSeverity;
  });

  const handleClearLogs = () => {
    if (confirm('Are you sure you want to clear all system audit logs? This action cannot be undone.')) {
      onUpdateAuditLogs([]);
      setSaveSuccess('System audit logs cleared successfully.');
      setTimeout(() => setSaveSuccess(null), 3000);
    }
  };

  const handleExportLogs = () => {
    const headers = ['Log ID', 'Timestamp', 'Admin User', 'Action', 'Target Entity', 'IP Address', 'Severity'];
    const rows = auditLogs.map(log => [
      log.id,
      log.timestamp,
      log.adminUser,
      log.action,
      log.targetEntity,
      log.ipAddress,
      log.severity
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `system_audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setSaveSuccess('Logs exported to CSV successfully.');
    setTimeout(() => setSaveSuccess(null), 3000);
  };

  const [isAddonModalOpen, setIsAddonModalOpen] = useState(false);
  const [editingAddonId, setEditingAddonId] = useState<string | null>(null);
  const [addonForm, setAddonForm] = useState<Partial<PlatformAddon>>({
    name: '',
    category: 'Marketing',
    pricingType: 'Free',
    price: 0,
    description: '',
    icon: 'Box',
    isPublished: true
  });

  const handleOpenAddAddon = () => {
    setEditingAddonId(null);
    setAddonForm({
      name: '',
      category: 'Marketing',
      pricingType: 'Free',
      price: 0,
      description: '',
      icon: 'Box',
      isPublished: true
    });
    setIsAddonModalOpen(true);
  };

  const handleOpenEditAddon = (addon: PlatformAddon) => {
    setEditingAddonId(addon.id);
    setAddonForm(addon);
    setIsAddonModalOpen(true);
  };

  const handleDeleteAddon = (id: string) => {
    if (confirm('Are you sure you want to delete this add-on?')) {
      onUpdatePlatformAddons(platformAddons.filter(a => a.id !== id));
      setSaveSuccess('Add-on deleted successfully!');
      setTimeout(() => setSaveSuccess(null), 3000);
    }
  };

  const handleSaveAddon = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingAddonId) {
      onUpdatePlatformAddons(platformAddons.map(a => a.id === editingAddonId ? { ...a, ...addonForm } as PlatformAddon : a));
      setSaveSuccess('Add-on updated successfully!');
    } else {
      const newAddon: PlatformAddon = {
        ...addonForm,
        id: `addon-${Date.now()}`
      } as PlatformAddon;
      onUpdatePlatformAddons([newAddon, ...platformAddons]);
      setSaveSuccess('New add-on added successfully!');
    }
    setIsAddonModalOpen(false);
    setTimeout(() => setSaveSuccess(null), 3000);
  };

  // Theme Manager States
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);
  const [themeForm, setThemeForm] = useState<Partial<PlatformTheme>>({
    name: '',
    category: 'General',
    price: 0,
    isFree: true,
    thumbnailUrl: '',
    previewUrl: '#',
    status: 'Active'
  });

  const handleOpenAddTheme = () => {
    setEditingThemeId(null);
    setThemeForm({
      name: '',
      category: 'General',
      price: 0,
      isFree: true,
      thumbnailUrl: '',
      previewUrl: '#',
      status: 'Active'
    });
    setIsThemeModalOpen(true);
  };

  const handleOpenEditTheme = (theme: PlatformTheme) => {
    setEditingThemeId(theme.id);
    setThemeForm(theme);
    setIsThemeModalOpen(true);
  };

  const handleDeleteTheme = (id: string) => {
    if (confirm('Are you sure you want to delete this theme?')) {
      onUpdatePlatformThemes(platformThemes.filter(t => t.id !== id));
      setSaveSuccess('Theme deleted successfully!');
      setTimeout(() => setSaveSuccess(null), 3000);
    }
  };

  const handleSaveTheme = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingThemeId) {
      onUpdatePlatformThemes(platformThemes.map(t => t.id === editingThemeId ? { ...t, ...themeForm } as PlatformTheme : t));
      setSaveSuccess('Theme updated successfully!');
    } else {
      const newTheme: PlatformTheme = {
        ...themeForm,
        id: `theme-${Date.now()}`
      } as PlatformTheme;
      onUpdatePlatformThemes([newTheme, ...platformThemes]);
      setSaveSuccess('New theme added successfully!');
    }
    setIsThemeModalOpen(false);
    setTimeout(() => setSaveSuccess(null), 3000);
  };

  // Support Tickets State
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [ticketSearchQuery, setTicketSearchQuery] = useState('');
  const [ticketStatusFilter, setTicketStatusFilter] = useState<'All' | 'Open' | 'In Progress' | 'Resolved'>('All');

  const [approvalStatusFilter, setApprovalStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('Pending');
  const [selectedApprovalRequest, setSelectedApprovalRequest] = useState<any | null>(null);
  const [isApprovalDetailsModalOpen, setIsApprovalDetailsModalOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(text);
    setTimeout(() => setCopySuccess(null), 2000);
  };

  const filteredSubscriptionRequests = pendingRequests.filter(req => {
    if (approvalStatusFilter === 'All') return true;
    return req.status.toLowerCase() === approvalStatusFilter.toLowerCase();
  });

  const filteredThemeRequests = themePurchaseRequests.filter(req => {
    if (approvalStatusFilter === 'All') return true;
    if (approvalStatusFilter === 'Pending') return req.status === 'pending_approval';
    return req.status.toLowerCase() === approvalStatusFilter.toLowerCase();
  });

  const filteredTickets = supportTickets.filter(ticket => {
    const matchesSearch = ticket.subject.toLowerCase().includes(ticketSearchQuery.toLowerCase()) ||
                         (ticket?.storeName || '').toLowerCase().includes(ticketSearchQuery.toLowerCase()) ||
                         ticket.id.toLowerCase().includes(ticketSearchQuery.toLowerCase());
    const matchesStatus = ticketStatusFilter === 'All' || ticket.status === ticketStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const selectedTicket = supportTickets.find(t => t.id === selectedTicketId);

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicketId || !replyMessage.trim()) return;

    const newMessage: TicketMessage = {
      id: `msg-${Date.now()}`,
      sender: 'admin',
      message: replyMessage,
      timestamp: new Date().toISOString()
    };

    onUpdateSupportTickets(prev => prev.map(t =>
      t.id === selectedTicketId
        ? { ...t, messages: [...t.messages, newMessage], status: t.status === 'Open' ? 'In Progress' : t.status }
        : t
    ));
    setReplyMessage('');
  };

  const handleUpdateTicketStatus = (ticketId: string, status: 'Open' | 'In Progress' | 'Resolved') => {
    onUpdateSupportTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status } : t));
    setSaveSuccess(`Ticket status updated to ${status}`);
    setTimeout(() => setSaveSuccess(null), 3000);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdatePlatformSettings(settingsForm);
    setSaveSuccess('Platform settings updated successfully!');
    setTimeout(() => setSaveSuccess(null), 3000);
  };

  const handleSaveAnnouncement = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdatePlatformAnnouncement(announcementForm);
    setSaveSuccess('Notice banner updated successfully!');
    setTimeout(() => setSaveSuccess(null), 3000);
  };

  const handleSavePlans = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdatePlatformPlans(plansForm);
    setSaveSuccess('Subscription plans updated successfully!');
    setTimeout(() => setSaveSuccess(null), 3000);
  };

  const handleAddPlan = () => {
    const newPlan: SubscriptionPlan = {
      id: `plan-${Date.now()}`,
      name: 'New Subscription Plan',
      price: 0,
      durationDays: 30,
      badge: 'NEW',
      features: ['Feature 1', 'Feature 2'],
      isActive: true,
      isPopular: false
    };
    setPlansForm([...plansForm, newPlan]);
  };

  const handleDeletePlan = (id: string) => {
    setPlansForm(plansForm.filter(p => p.id !== id));
  };

  const handleCreateMerchant = (e: React.FormEvent) => {
    e.preventDefault();
    const slug = (newMerchantForm?.storeName || '').toLowerCase().replace(/\s+/g, '-');
    const isPaid = newMerchantForm.plan !== 'free_trial';
    const { expiryDate, durationDays, plan_started_at, expires_at } = calculateSubscriptionExpiry(
      newMerchantForm.plan,
      new Date()
    );

    const newMerchant: MerchantProfile = {
      storeName: newMerchantForm?.storeName || 'New Store',
      storeSlug: slug || 'new-store',
      email: newMerchantForm.email,
      subscriptionPlan: newMerchantForm.plan,
      subscriptionExpiry: isPaid ? expiryDate : undefined,
      plan_started_at: isPaid ? plan_started_at : undefined,
      expires_at: isPaid ? expires_at : undefined,
      planStartedAt: isPaid ? plan_started_at : undefined,
      expiresAt: isPaid ? expires_at : undefined,
      selectedPlanDays: isPaid ? durationDays : undefined,
      trialEndsAt: isPaid ? undefined : expires_at,
      trialDaysRemaining: isPaid ? 0 : 30,
      trialDaysTotal: isPaid ? 0 : 30,
      isLocked: false,
      logoUrl: '',
      currency: 'BDT',
      exchangeRateBDT: 120,
      onboardingProgress: 0,
      totalSalesBDT: 0,
      activeThemeId: 'theme-1',
      themeConfig: {}
    };
    onUpdateAllMerchants(prev => [...prev, newMerchant]);

    // Asynchronously push to Supabase if client exists
    if (supabase) {
      (async () => {
        try {
          await supabase.from('stores').insert([{
            store_name: newMerchant.storeName,
            store_slug: newMerchant.storeSlug,
            email: newMerchant.email,
            subscription_plan: newMerchant.subscriptionPlan,
            subscription_expiry: newMerchant.subscriptionExpiry,
            plan_started_at: newMerchant.plan_started_at,
            expires_at: newMerchant.expires_at,
            duration_days: durationDays
          }]);
        } catch (err) {
          console.warn('Notice: Supabase insert merchant sync notice', err);
        }
      })();
    }

    setIsCreateMerchantModalOpen(false);
    setNewMerchantForm({ storeName: '', email: '', plan: 'free_trial', expiryDays: 30 });
    setSaveSuccess(`Store "${newMerchantForm?.storeName || 'New Store'}" created successfully!`);
    setTimeout(() => setSaveSuccess(null), 3000);
  };
  const totalOnboardedStores = 0;
  const aggregateMerchantSales = 0;
  const totalCompletedOrders = 0;
  const platformSubscriptionRevenue = 0;

  const topStores: any[] = [];
  const recentRenewals: any[] = [];

  // Gateway config form state
  const [gatewayForm, setGatewayForm] = useState<AdminPaymentGatewayConfig>(adminPaymentConfig);
  const [gatewaySavedMessage, setGatewaySavedMessage] = useState(false);
  const [isCustomGatewayModalOpen, setIsCustomGatewayModalOpen] = useState(false);
  const [newCustomGateway, setNewCustomGateway] = useState<Partial<AdminCustomGateway>>({
    name: '',
    details: '',
    isActive: true
  });

  const handleAddCustomGateway = () => {
    if (!newCustomGateway.name || !newCustomGateway.details) return;
    const gateway: AdminCustomGateway = {
      id: `custom-${Date.now()}`,
      name: newCustomGateway.name || '',
      details: newCustomGateway.details || '',
      logoUrl: newCustomGateway.logoUrl,
      qrCodeUrl: newCustomGateway.qrCodeUrl,
      isActive: true
    };
    setGatewayForm(prev => ({
      ...prev,
      customGateways: [...(prev.customGateways || []), gateway]
    }));
    setIsCustomGatewayModalOpen(false);
    setNewCustomGateway({ name: '', details: '', isActive: true });
  };

  const removeCustomGateway = (id: string) => {
    setGatewayForm(prev => ({
      ...prev,
      customGateways: prev.customGateways.filter(g => g.id !== id)
    }));
  };

  const toggleCustomGateway = (id: string) => {
    setGatewayForm(prev => ({
      ...prev,
      customGateways: prev.customGateways.map(g => g.id === id ? { ...g, isActive: !g.isActive } : g)
    }));
  };

  // Search filter for merchants
  const [merchantSearchQuery, setMerchantSearchQuery] = useState('');
  const [merchantStatusFilter, setMerchantStatusFilter] = useState<'all' | 'active' | 'trial' | 'suspended'>('all');
  const [merchantCurrentPage, setMerchantCurrentPage] = useState(1);
  const merchantItemsPerPage = 5;

  const handleSaveGateways = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateAdminPaymentConfig(gatewayForm);
    setGatewaySavedMessage(true);
    setTimeout(() => setGatewaySavedMessage(false), 3000);
  };

  const handleApproveRequest = (reqId: string) => {
    const req = pendingRequests.find(r => r.id === reqId);
    if (!req) return;

    // Calculate dynamic expiration date starting from TODAY based ONLY on the purchased plan duration (no leftover trial days added)
    const { expiryDate, durationDays, plan_started_at, expires_at } = calculateSubscriptionExpiry(req.planId, new Date());
    const planName = getPlanDisplayName(req.planId);

    // Update request status
    const updatedPending = pendingRequests.map(r => r.id === reqId ? { ...r, status: 'approved' as const } : r);
    onUpdatePendingRequests(updatedPending);
    try {
      localStorage.setItem('ZID_PENDING_REQUESTS', JSON.stringify(updatedPending));
    } catch (e) {
      console.error(e);
    }

    // Update allMerchants list with purchased plan validity starting today, deactivating free trial
    const updatedMerchants = allMerchants.map(m => {
      const match = (req?.email && m?.email && req.email.toLowerCase() === m.email.toLowerCase()) ||
        (req?.storeName && m?.storeName && req.storeName.toLowerCase() === m.storeName.toLowerCase());
      if (match) {
        const updatedM: MerchantProfile = {
          ...m,
          subscriptionPlan: req.planId as SubscriptionPlanId,
          trialDaysRemaining: 0,
          trialEndsAt: undefined,
          subscriptionExpiry: expiryDate,
          plan_started_at: plan_started_at,
          expires_at: expires_at,
          planStartedAt: plan_started_at,
          expiresAt: expires_at,
          selectedPlanDays: durationDays,
          isLocked: false
        };
        // Also update merchant store database if slug exists
        if (m.storeSlug) {
          try {
            const key = `ZID_MERCHANT_STORE_DATA_${m.storeSlug}`;
            const existing = localStorage.getItem(key);
            if (existing) {
              const parsed = JSON.parse(existing);
              parsed.merchant = updatedM;
              localStorage.setItem(key, JSON.stringify(parsed));
            }
          } catch (err) {}
        }
        return updatedM;
      }
      return m;
    });

    onUpdateAllMerchants(updatedMerchants);
    try {
      localStorage.setItem('ZID_ALL_MERCHANTS', JSON.stringify(updatedMerchants));
    } catch (e) {
      console.error(e);
    }

    // Direct sync to Supabase database for the approved merchant
    if (supabase) {
      (async () => {
        try {
          const updatePayload = {
            subscription_plan: req.planId,
            subscription_expiry: expiryDate,
            plan_started_at: plan_started_at,
            expires_at: expires_at,
            duration_days: durationDays
          };

          if (req.email) {
            await supabase.from('stores').update(updatePayload).ilike('email', req.email.trim());
            await supabase.from('subscriptions').upsert([{
              merchant_email: req.email.trim().toLowerCase(),
              store_slug: (req.storeName || '').toLowerCase().replace(/\s+/g, '-'),
              subscription_plan: req.planId,
              plan_started_at: plan_started_at,
              expires_at: expires_at,
              duration_days: durationDays,
              status: 'active'
            }]);
          }
        } catch (err) {
          console.warn('Notice: Supabase approve sync notice', err);
        }
      })();
    }

    // Check if the current logged-in merchant matches
    const isCurrentMatch = (req?.email && currentMerchant?.email && req.email.toLowerCase() === currentMerchant.email.toLowerCase()) ||
      (req?.storeName && currentMerchant?.storeName && req.storeName.toLowerCase() === currentMerchant.storeName.toLowerCase());

    if (isCurrentMatch) {
      const updatedCurrent: MerchantProfile = {
        ...currentMerchant,
        subscriptionPlan: req.planId as SubscriptionPlanId,
        trialDaysRemaining: 0,
        trialEndsAt: undefined,
        subscriptionExpiry: expiryDate,
        plan_started_at: plan_started_at,
        expires_at: expires_at,
        planStartedAt: plan_started_at,
        expiresAt: expires_at,
        selectedPlanDays: durationDays,
        isLocked: false
      };
      onUpdateMerchant(updatedCurrent);

      try {
        // Direct sync with main store and auth session in localStorage
        const savedSession = localStorage.getItem('zid_auth_session');
        if (savedSession) {
          const parsed = JSON.parse(savedSession);
          parsed.userProfile = updatedCurrent;
          localStorage.setItem('zid_auth_session', JSON.stringify(parsed));
        }

        const savedStore = localStorage.getItem('ZID_MERCHANT_STORE_DATA');
        if (savedStore) {
          const parsed = JSON.parse(savedStore);
          parsed.merchant = updatedCurrent;
          localStorage.setItem('ZID_MERCHANT_STORE_DATA', JSON.stringify(parsed));
        }

        if (updatedCurrent.storeSlug) {
          const key = `ZID_MERCHANT_STORE_DATA_${updatedCurrent.storeSlug}`;
          const existing = localStorage.getItem(key);
          if (existing) {
            const parsed = JSON.parse(existing);
            parsed.merchant = updatedCurrent;
            localStorage.setItem(key, JSON.stringify(parsed));
          }
        }
      } catch (e) {
        console.error(e);
      }
    }

    setSaveSuccess(`Subscription for "${req?.storeName || 'Store'}" approved! Active plan: ${planName} (${durationDays} Days from today, valid until ${expiryDate}). Remaining free trial days cleared.`);
    setTimeout(() => setSaveSuccess(null), 4000);
  };

  const handleRejectRequest = (reqId: string) => {
    const req = pendingRequests.find(r => r.id === reqId);
    if (!req) return;

    onUpdatePendingRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: 'rejected' } : r));
    setSaveSuccess(`Subscription for "${req?.storeName || 'Store'}" rejected.`);
    setTimeout(() => setSaveSuccess(null), 3000);
  };

  const handleApproveThemePurchase = (reqId: string) => {
    const req = themePurchaseRequests.find(r => r.id === reqId);
    if (!req) return;

    if (onUpdateThemePurchaseRequests) {
      onUpdateThemePurchaseRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: 'approved' } : r));
    }

    // Unlock theme for merchant in allMerchants list
    onUpdateAllMerchants(prev => prev.map(m => {
      if (
        (req.storeId && m?.storeSlug === req.storeId) ||
        (req.storeName && m?.storeName === req.storeName) ||
        (m?.email && req.email && m?.email === req.email)
      ) {
        const existing = m?.unlockedThemeIds || [];
        const updatedUnlocked = existing.includes(req.themeId) ? existing : [...existing, req.themeId];
        return {
          ...m,
          unlockedThemeIds: updatedUnlocked
        };
      }
      return m;
    }));

    // If current active merchant matches, unlock theme for them
    if (
      (req.storeId && currentMerchant?.storeSlug === req.storeId) ||
      (req.storeName && currentMerchant?.storeName === req.storeName) ||
      (currentMerchant?.email && req.email && currentMerchant?.email === req.email)
    ) {
      const existing = currentMerchant?.unlockedThemeIds || [];
      const updatedUnlocked = existing.includes(req.themeId) ? existing : [...existing, req.themeId];
      onUpdateMerchant({
        ...currentMerchant,
        unlockedThemeIds: updatedUnlocked
      });
    }

    alert(`Theme purchase request approved! Theme "${req.themeName}" is now unlocked for merchant "${req?.storeName || 'Store'}".`);
  };

  const handleRejectThemePurchase = (reqId: string) => {
    if (onUpdateThemePurchaseRequests) {
      onUpdateThemePurchaseRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: 'rejected' } : r));
    }
    alert('Theme purchase request rejected.');
  };

  const handleExtendTrial = (storeName: string, days: number) => {
    let updatedEndsAtIso = '';
    let updatedRemaining = 0;
    const updatedMerchants = allMerchants.map(m => {
      if (m?.storeName === storeName) {
        const currentEndsAt = m.trialEndsAt ? new Date(m.trialEndsAt) : new Date();
        const newEndsAt = new Date(currentEndsAt.getTime() + days * 24 * 60 * 60 * 1000);
        updatedEndsAtIso = newEndsAt.toISOString();
        updatedRemaining = (m?.trialDaysRemaining ?? 30) + days;
        const updatedM = {
          ...m,
          trialDaysRemaining: updatedRemaining,
          trialEndsAt: updatedEndsAtIso
        };
        if (m.storeSlug) {
          try {
            const key = `ZID_MERCHANT_STORE_DATA_${m.storeSlug}`;
            const existing = localStorage.getItem(key);
            if (existing) {
              const parsed = JSON.parse(existing);
              parsed.merchant = updatedM;
              localStorage.setItem(key, JSON.stringify(parsed));
            }
          } catch (err) {}
        }
        return updatedM;
      }
      return m;
    });

    onUpdateAllMerchants(updatedMerchants);
    try {
      localStorage.setItem('ZID_ALL_MERCHANTS', JSON.stringify(updatedMerchants));
    } catch (e) {}

    if (storeName === currentMerchant?.storeName) {
      const updatedCurrent = {
        ...currentMerchant,
        trialDaysRemaining: updatedRemaining,
        trialEndsAt: updatedEndsAtIso
      };
      onUpdateMerchant(updatedCurrent);
      try {
        const savedSession = localStorage.getItem('zid_auth_session');
        if (savedSession) {
          const parsed = JSON.parse(savedSession);
          parsed.userProfile = updatedCurrent;
          localStorage.setItem('zid_auth_session', JSON.stringify(parsed));
        }
        const savedStore = localStorage.getItem('ZID_MERCHANT_STORE_DATA');
        if (savedStore) {
          const parsed = JSON.parse(savedStore);
          parsed.merchant = updatedCurrent;
          localStorage.setItem('ZID_MERCHANT_STORE_DATA', JSON.stringify(parsed));
        }
      } catch (e) {}
    }
    alert(`Successfully extended trial for "${storeName}" by ${days} days.`);
  };

  const handleToggleLockMerchant = (storeName: string) => {
    let nextLockedState = false;
    const updatedMerchants = allMerchants.map(m => {
      if (m?.storeName === storeName) {
        nextLockedState = !m?.isLocked;
        const updatedM = {
          ...m,
          isLocked: nextLockedState
        };
        if (m.storeSlug) {
          try {
            const key = `ZID_MERCHANT_STORE_DATA_${m.storeSlug}`;
            const existing = localStorage.getItem(key);
            if (existing) {
              const parsed = JSON.parse(existing);
              parsed.merchant = updatedM;
              localStorage.setItem(key, JSON.stringify(parsed));
            }
          } catch (err) {}
        }
        return updatedM;
      }
      return m;
    });

    onUpdateAllMerchants(updatedMerchants);
    try {
      localStorage.setItem('ZID_ALL_MERCHANTS', JSON.stringify(updatedMerchants));
    } catch (e) {}

    if (storeName === currentMerchant?.storeName) {
      const updatedCurrent = {
        ...currentMerchant,
        isLocked: nextLockedState
      };
      onUpdateMerchant(updatedCurrent);
      try {
        const savedSession = localStorage.getItem('zid_auth_session');
        if (savedSession) {
          const parsed = JSON.parse(savedSession);
          parsed.userProfile = updatedCurrent;
          localStorage.setItem('zid_auth_session', JSON.stringify(parsed));
        }
        const savedStore = localStorage.getItem('ZID_MERCHANT_STORE_DATA');
        if (savedStore) {
          const parsed = JSON.parse(savedStore);
          parsed.merchant = updatedCurrent;
          localStorage.setItem('ZID_MERCHANT_STORE_DATA', JSON.stringify(parsed));
        }
      } catch (e) {}
    }
  };

  const handleDeleteMerchant = (storeSlug: string, storeName: string) => {
    if (window.confirm(`WARNING: Are you sure you want to permanently delete the merchant "${storeName}"? This action cannot be undone.`)) {
      const updatedMerchants = allMerchants.filter(m => m?.storeSlug !== storeSlug);
      onUpdateAllMerchants(updatedMerchants);
      try {
        localStorage.setItem('ZID_ALL_MERCHANTS', JSON.stringify(updatedMerchants));
        localStorage.removeItem(`ZID_MERCHANT_STORE_DATA_${storeSlug}`);
      } catch (e) {
        console.error('Failed to remove store data', e);
      }
    }
  };

  const handleClearFakeTransactions = () => {
    if (window.confirm('WARNING: Are you sure you want to permanently clear ALL transaction records (Subscriptions and Theme Purchases)? This is meant for pre-launch database resets.')) {
      onUpdatePendingRequests([]);
      if (onUpdateThemePurchaseRequests) {
        onUpdateThemePurchaseRequests([]);
      }
      try {
        localStorage.removeItem('ZID_PENDING_REQUESTS');
        localStorage.removeItem('ZID_THEME_PURCHASE_REQUESTS');
      } catch (e) {
        console.error('Failed to clear transaction records', e);
      }
    }
  };

  const handleChangePlan = (storeName: string) => {
    const m = allMerchants.find(x => x?.storeName === storeName);
    if (!m) return;

    // Cycle through plans for demo/simple logic
    const plans: SubscriptionPlanId[] = ['free_trial', 'starter_3m', 'pro_6m', 'enterprise_12m'];
    const currentIndex = plans.indexOf(m.subscriptionPlan || 'free_trial');
    const nextIndex = (currentIndex + 1) % plans.length;
    const nextPlan = plans[nextIndex];

    const isNowTrial = nextPlan === 'free_trial';
    const { expiryDate, durationDays, plan_started_at, expires_at } = calculateSubscriptionExpiry(nextPlan, new Date());
    const newExpiry = isNowTrial ? undefined : expiryDate;
    const newTrialEndsAt = isNowTrial ? expires_at : undefined;
    const newTrialDaysRemaining = isNowTrial ? 30 : 0;

    const updatedMerchants = allMerchants.map(x => {
      if (x?.storeName === storeName) {
        const updatedM = {
          ...x,
          subscriptionPlan: nextPlan,
          subscriptionExpiry: newExpiry,
          plan_started_at: isNowTrial ? undefined : plan_started_at,
          expires_at: isNowTrial ? undefined : expires_at,
          planStartedAt: isNowTrial ? undefined : plan_started_at,
          expiresAt: isNowTrial ? undefined : expires_at,
          selectedPlanDays: isNowTrial ? undefined : durationDays,
          trialEndsAt: newTrialEndsAt,
          trialDaysRemaining: newTrialDaysRemaining
        };
        if (x.storeSlug) {
          try {
            const key = `ZID_MERCHANT_STORE_DATA_${x.storeSlug}`;
            const existing = localStorage.getItem(key);
            if (existing) {
              const parsed = JSON.parse(existing);
              parsed.merchant = updatedM;
              localStorage.setItem(key, JSON.stringify(parsed));
            }
          } catch (err) {}
        }
        return updatedM;
      }
      return x;
    });

    onUpdateAllMerchants(updatedMerchants);
    try {
      localStorage.setItem('ZID_ALL_MERCHANTS', JSON.stringify(updatedMerchants));
    } catch (e) {}

    if (storeName === currentMerchant?.storeName) {
      const updatedCurrent = {
        ...currentMerchant,
        subscriptionPlan: nextPlan,
        subscriptionExpiry: newExpiry,
        plan_started_at: isNowTrial ? undefined : plan_started_at,
        expires_at: isNowTrial ? undefined : expires_at,
        planStartedAt: isNowTrial ? undefined : plan_started_at,
        expiresAt: isNowTrial ? undefined : expires_at,
        selectedPlanDays: isNowTrial ? undefined : durationDays,
        trialEndsAt: newTrialEndsAt,
        trialDaysRemaining: newTrialDaysRemaining
      };
      onUpdateMerchant(updatedCurrent);
      try {
        const savedSession = localStorage.getItem('zid_auth_session');
        if (savedSession) {
          const parsed = JSON.parse(savedSession);
          parsed.userProfile = updatedCurrent;
          localStorage.setItem('zid_auth_session', JSON.stringify(parsed));
        }
        const savedStore = localStorage.getItem('ZID_MERCHANT_STORE_DATA');
        if (savedStore) {
          const parsed = JSON.parse(savedStore);
          parsed.merchant = updatedCurrent;
          localStorage.setItem('ZID_MERCHANT_STORE_DATA', JSON.stringify(parsed));
        }
      } catch (e) {}
    }
    alert(`Changed plan for "${storeName}" to ${getPlanDisplayName(nextPlan)}`);
  };

  const filteredMerchants = allMerchants.filter(m => {
    const query = merchantSearchQuery.toLowerCase();
    const matchesSearch =
      (m?.storeName || '').toLowerCase().includes(query) ||
      (m?.email || '').toLowerCase().includes(query) ||
      (m?.ownerName || '').toLowerCase().includes(query);

    if (!matchesSearch) return false;

    if (merchantStatusFilter === 'all') return true;
    if (merchantStatusFilter === 'active') return m.subscriptionPlan !== 'trial' && m.subscriptionPlan !== 'free_trial' && !m.isLocked;
    if (merchantStatusFilter === 'trial') return m.subscriptionPlan === 'trial' || m.subscriptionPlan === 'free_trial';
    if (merchantStatusFilter === 'suspended') return m.isLocked === true;

    return true;
  });

  const totalMerchantPages = Math.ceil(filteredMerchants.length / merchantItemsPerPage);
  const paginatedMerchants = filteredMerchants.slice(
    (merchantCurrentPage - 1) * merchantItemsPerPage,
    merchantCurrentPage * merchantItemsPerPage
  );

  return (
    <div className="min-h-screen bg-[#12151F] text-slate-100 flex flex-col font-sans">

      {/* Super Admin Top Header Bar */}
      <header className="bg-[#181B26] border-b border-[#2E3548] px-6 py-4 flex items-center justify-between sticky top-0 z-50 shadow-lg">
        <div className="flex items-center gap-3">
          <BrandLogo size="md" subtitle="Super Admin Portal" />
          <span className="text-[10px] bg-red-500/20 text-red-400 font-bold px-2 py-0.5 rounded border border-red-500/30 uppercase">
            Restricted Access
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onSwitchToMerchantPortal}
            className="bg-[#202533] hover:bg-[#282E3F] text-slate-200 border border-[#3A435E] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer"
          >
            <span>Switch to Merchant Dashboard ({currentMerchant?.storeName || 'Store'})</span>
            <ArrowUpRight className="w-4 h-4 text-[#D4AF37]" />
          </button>
        </div>
      </header>

      {/* Main Admin Body */}
      <div className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">

        {/* Sub-tab Navigation - Grouped Category Dropdowns */}
        {(() => {
          const pendingApprovalsCount = pendingRequests.filter(r => r.status === 'pending').length;
          const unresolvedSupportCount = supportTickets.filter(t => t.status !== 'Resolved').length;

          type SubTabKey = 'analytics' | 'gateways' | 'approvals' | 'merchants' | 'settings' | 'announcements' | 'plans' | 'themes' | 'support' | 'addons' | 'security' | 'broadcast' | 'team';

          interface NavSubItem {
            id: SubTabKey;
            label: string;
            icon: React.ComponentType<{ className?: string }>;
            badge?: number;
            badgeColor?: string;
          }

          interface NavCategory {
            id: string;
            title: string;
            icon: React.ComponentType<{ className?: string }>;
            items: NavSubItem[];
          }

          const navCategories: NavCategory[] = [
            {
              id: 'analytics_merchants',
              title: 'Analytics & Merchants',
              icon: DollarSign,
              items: [
                { id: 'analytics', label: 'Global Analytics & Sales', icon: DollarSign },
                { id: 'merchants', label: `Merchant Accounts (${allMerchants.length})`, icon: Users },
                { id: 'approvals', label: 'Pending Subscriptions', icon: Clock, badge: pendingApprovalsCount, badgeColor: 'bg-amber-500 text-slate-950 font-black' },
              ]
            },
            {
              id: 'plans_features',
              title: 'Plans & Features',
              icon: ShoppingBag,
              items: [
                { id: 'plans', label: 'Subscription Plans', icon: ShoppingBag },
                { id: 'themes', label: 'Theme Manager', icon: Palette },
                { id: 'addons', label: 'Add-ons Manager', icon: Box },
              ]
            },
            {
              id: 'system_gateways',
              title: 'System & Gateways',
              icon: Settings,
              items: [
                { id: 'gateways', label: 'Live Payment Gateways', icon: CreditCard },
                { id: 'security', label: 'Security & Logs', icon: ShieldCheck },
                { id: 'settings', label: 'Platform Settings', icon: Settings },
              ]
            },
            {
              id: 'support_comm',
              title: 'Support & Communication',
              icon: LifeBuoy,
              items: [
                { id: 'support', label: 'Support Tickets', icon: LifeBuoy, badge: unresolvedSupportCount, badgeColor: 'bg-red-500 text-white font-black' },
                { id: 'broadcast', label: 'Broadcast & Emails', icon: Bell },
                { id: 'announcements', label: 'Notice Banner', icon: AlertCircle },
              ]
            },
            {
              id: 'admin_access',
              title: 'Admin Access',
              icon: UserCog,
              items: [
                { id: 'team', label: 'Admin Team', icon: Users },
              ]
            }
          ];

          return (
            <div className="flex items-center border-b border-[#2E3548] gap-3 pb-3 flex-wrap">
              {navCategories.map((cat) => {
                const isCategoryActive = cat.items.some(item => item.id === activeSubTab);
                const catBadgeTotal = cat.items.reduce((acc, item) => acc + (item.badge || 0), 0);
                const CatIcon = cat.icon;
                const isOpen = openCategory === cat.id;

                return (
                  <div
                    key={cat.id}
                    className="relative group"
                    onMouseEnter={() => setOpenCategory(cat.id)}
                    onMouseLeave={() => setOpenCategory(null)}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenCategory(isOpen ? null : cat.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                        isCategoryActive
                          ? 'bg-[#252B3B] text-[#D4AF37] border-[#D4AF37]/50 shadow-md shadow-[#D4AF37]/10'
                          : 'bg-[#181B26] text-slate-300 border-[#2E3548] hover:bg-[#202533] hover:text-white hover:border-slate-600'
                      }`}
                    >
                      <CatIcon className={`w-4 h-4 ${isCategoryActive ? 'text-[#D4AF37]' : 'text-slate-400'}`} />
                      <span>{cat.title}</span>
                      {catBadgeTotal > 0 && (
                        <span className="bg-amber-500 text-slate-950 font-black text-[10px] px-1.5 py-0.2 rounded-full">
                          {catBadgeTotal}
                        </span>
                      )}
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-[#D4AF37]' : 'text-slate-400 group-hover:text-white'
                      }`} />
                    </button>

                    {/* Sub-menu Dropdown */}
                    <div className={`absolute top-full left-0 mt-1.5 w-64 bg-[#181B26] border border-[#2E3548] rounded-xl shadow-2xl p-2 z-50 transition-all duration-150 ${
                      isOpen
                        ? 'opacity-100 visible translate-y-0'
                        : 'opacity-0 invisible -translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0'
                    }`}>
                      <div className="space-y-1">
                        {cat.items.map((sub) => {
                          const isSubActive = activeSubTab === sub.id;
                          const SubIcon = sub.icon;
                          return (
                            <button
                              key={sub.id}
                              onClick={() => {
                                setActiveSubTab(sub.id);
                                setOpenCategory(null);
                              }}
                              className={`w-full text-left flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                                isSubActive
                                  ? 'bg-[#D4AF37]/20 text-[#D4AF37] font-bold border border-[#D4AF37]/40 shadow-sm'
                                  : 'text-slate-300 hover:bg-[#222838] hover:text-white'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <SubIcon className={`w-4 h-4 ${isSubActive ? 'text-[#D4AF37]' : 'text-slate-400'}`} />
                                <span>{sub.label}</span>
                              </div>
                              {!!sub.badge && sub.badge > 0 && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${sub.badgeColor || 'bg-amber-500 text-slate-950'}`}>
                                  {sub.badge}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* 1. ANALYTICS & GLOBAL SALES TAB */}
        {activeSubTab === 'analytics' && (
          <div className="space-y-6">
            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl p-5 space-y-2">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs uppercase font-semibold">Total Platform Sales</span>
                  <DollarSign className="w-5 h-5 text-[#D4AF37]" />
                </div>
                <div className="text-2xl font-black text-white">৳0 BDT</div>
                <div className="text-[11px] text-[#D4AF37] flex items-center gap-1 font-semibold">
                  <span>0.0% growth across 0 stores</span>
                </div>
              </div>

              <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl p-5 space-y-2">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs uppercase font-semibold">Total Order Volume</span>
                  <ShoppingBag className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="text-2xl font-black text-white">0 Orders</div>
                <div className="text-[11px] text-slate-400">Processed by 0 onboarded stores</div>
              </div>

              <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl p-5 space-y-2">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs uppercase font-semibold">SaaS Subscription Revenue</span>
                  <CreditCard className="w-5 h-5 text-pink-400" />
                </div>
                <div className="text-2xl font-black text-white">৳0 BDT</div>
                <div className="text-[11px] text-pink-400 font-semibold">0% Retained SaaS Earnings</div>
              </div>

              <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl p-5 space-y-2">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs uppercase font-semibold">Active Merchants</span>
                  <Users className="w-5 h-5 text-amber-400" />
                </div>
                <div className="text-2xl font-black text-white">0 Stores</div>
                <div className="text-[11px] text-amber-400 font-semibold">0% Commission Model</div>
              </div>
            </div>

            {/* AI Executive Summary Widget */}
            <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-indigo-400" />
                  AI Executive Summary
                </h3>
                <button
                  onClick={async () => {
                    setIsGeneratingSummary(true);
                    try {
                      const response = await fetch('/api/ai/analytics-summary', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ analyticsData: { totalSales: '0 BDT', activeStores: allMerchants.length } })
                      });
                      const data = await response.json();
                      setAnalyticsSummary(data.summary);
                    } catch (e) {
                      setAnalyticsSummary('Failed to generate summary.');
                    } finally {
                      setIsGeneratingSummary(false);
                    }
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition"
                >
                  {isGeneratingSummary ? 'Analyzing...' : 'Generate Insights'}
                </button>
              </div>
              {analyticsSummary && (
                <div className="bg-[#202533] p-4 rounded-xl text-slate-300 text-sm leading-relaxed whitespace-pre-wrap border border-[#2E3548]">
                  {analyticsSummary}
                </div>
              )}
            </div>

            {/* Recent Platform Activity & Top Stores */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl p-6 space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#D4AF37]" />
                  Top Revenue Generating Stores
                </h3>
                <div className="space-y-3">
                  {topStores.length > 0 ? (
                    topStores.map((m, idx) => (
                      <div key={idx} className="bg-[#202533] border border-[#2E3548] p-3.5 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 font-bold flex items-center justify-center">
                            {(m?.storeName || 'S').charAt(0)}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white">{m?.storeName || ''}</div>
                            <div className="text-xs text-slate-400">store.zid.sa/{m?.storeSlug || ''}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-[#D4AF37]">৳{(m?.totalSalesBDT || 0).toLocaleString()} BDT</div>
                          <div className="text-[10px] text-slate-400 uppercase">{(m?.subscriptionPlan || 'Basic').replace('_', ' ')} plan</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-10 bg-[#202533]/50 border border-dashed border-[#2E3548] rounded-xl text-slate-500 text-sm">
                      এখনো কোনো স্টোর সেলস শুরু করেনি।
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl p-6 space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-pink-400" />
                  Recent Subscription Renewals
                </h3>
                <div className="space-y-3">
                  {recentRenewals.length > 0 ? (
                    recentRenewals.slice(0, 5).map((req, idx) => (
                      <div key={idx} className="bg-[#202533] border border-[#2E3548] p-3.5 rounded-xl flex items-center justify-between">
                        <div>
                          <div className="text-sm font-bold text-white">{req?.storeName || 'Store'}</div>
                          <div className="text-xs text-slate-400">{req.planName} • {req.paymentMethod.replace('_admin', '')} (TrxID: {req.transactionId})</div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs bg-[#D4AF37]/20 text-[#D4AF37] px-2.5 py-1 rounded-full font-bold">Approved</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-10 bg-[#202533]/50 border border-dashed border-[#2E3548] rounded-xl text-slate-500 text-sm">
                      কোনো সাম্প্রতিক রিনিউয়াল পাওয়া যায়নি।
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. PENDING SUBSCRIPTION REQUESTS & APPROVAL WORKFLOW TAB */}
        {activeSubTab === 'approvals' && (
          <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-base font-bold text-white">Approvals & Requests Management</h3>
                <p className="text-xs text-slate-400">
                  Verify Transaction IDs (TrxID) and process subscription or theme purchase requests.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleClearFakeTransactions}
                  className="bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white px-3 py-1.5 rounded-lg border border-red-500/30 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2"
                  title="Clear all test transaction records before launch"
                >
                  <Trash2 className="w-3 h-3" />
                  Clean Test Data
                </button>
                <div className="bg-[#202533] p-1 rounded-xl border border-[#2E3548] flex">
                  {['All', 'Pending', 'Approved', 'Rejected'].map((status) => (
                    <button
                      key={status}
                      onClick={() => setApprovalStatusFilter(status as any)}
                      className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all cursor-pointer ${
                        approvalStatusFilter === status
                          ? 'bg-indigo-600 text-white shadow-lg'
                          : 'text-slate-500 hover:text-white'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto border border-[#2E3548] rounded-xl bg-[#202533]/40">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#202533] text-slate-400 uppercase font-semibold border-b border-[#2E3548]">
                  <tr>
                    <th className="p-3.5 font-black text-[10px]">Merchant Store & Email</th>
                    <th className="p-3.5 font-black text-[10px]">Requested Plan & Amount</th>
                    <th className="p-3.5 font-black text-[10px]">Payment Method</th>
                    <th className="p-3.5 font-black text-[10px]">Transaction ID (TrxID)</th>
                    <th className="p-3.5 font-black text-[10px]">Status</th>
                    <th className="p-3.5 text-right font-black text-[10px]">Approval Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2E3548]">
                  {filteredSubscriptionRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-[#202533]/50 transition group">
                      <td className="p-3.5">
                        <div className="font-bold text-white">{req?.storeName || 'Store'}</div>
                        <div className="text-[11px] text-slate-400">{req.email}</div>
                      </td>
                      <td className="p-3.5">
                        <div className="font-bold text-white">{req.planName}</div>
                        <div className="text-[11px] text-[#D4AF37] font-bold">৳{req.amountBDT.toLocaleString()} BDT</div>
                      </td>
                      <td className="p-3.5 font-semibold text-slate-200 capitalize">
                        {req.paymentMethod.replace('_admin', '')}
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono bg-[#181B26] text-pink-400 px-2.5 py-1 rounded border border-[#2E3548] font-bold text-[11px]">
                            {req.transactionId}
                          </span>
                          <button
                            onClick={() => handleCopyToClipboard(req.transactionId)}
                            className="p-1.5 hover:bg-[#3A435E] rounded-lg transition-colors cursor-pointer text-slate-500 hover:text-white"
                            title="Copy Transaction ID"
                          >
                            {copySuccess === req.transactionId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2.5 py-1 rounded-lg font-black uppercase text-[9px] border ${
                          req.status === 'pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                          req.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                          'bg-red-500/10 text-red-400 border-red-500/20'
                        }`}>
                          {req.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-right space-x-2">
                        <button
                          onClick={() => {
                            setSelectedApprovalRequest({...req, type: 'subscription'});
                            setIsApprovalDetailsModalOpen(true);
                          }}
                          className="bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase transition cursor-pointer border border-indigo-500/20"
                        >
                          View Details
                        </button>
                        {req.status === 'pending' && (
                          <button
                            onClick={() => handleApproveRequest(req.id)}
                            className="bg-[#D4AF37] hover:bg-[#FCF6BA] text-slate-950 font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase transition cursor-pointer shadow-lg shadow-amber-500/20"
                          >
                            Approve
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredSubscriptionRequests.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-slate-500">
                        <div className="w-12 h-12 bg-[#202533] rounded-full flex items-center justify-center mx-auto mb-3 text-slate-600">
                          <History className="w-6 h-6" />
                        </div>
                        <p className="font-bold uppercase text-[10px] tracking-widest">No matching subscription requests found</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* SECTION 2: Theme Purchase Requests Table */}
            <div className="pt-6 border-t border-[#2E3548] space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-amber-400" />
                    <span>Theme Purchase Requests</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Review merchant payment Txn IDs for standalone theme purchases.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto border border-[#2E3548] rounded-xl bg-[#202533]/40">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#202533] text-slate-400 uppercase font-semibold border-b border-[#2E3548]">
                    <tr>
                      <th className="p-3.5 font-black text-[10px]">Merchant Store & Email</th>
                      <th className="p-3.5 font-black text-[10px]">Purchased Theme</th>
                      <th className="p-3.5 font-black text-[10px]">Amount</th>
                      <th className="p-3.5 font-black text-[10px]">Payment Method</th>
                      <th className="p-3.5 font-black text-[10px]">Transaction ID</th>
                      <th className="p-3.5 font-black text-[10px]">Status</th>
                      <th className="p-3.5 text-right font-black text-[10px]">Admin Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2E3548]">
                    {filteredThemeRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-[#202533] transition group">
                        <td className="p-3.5">
                          <div className="font-bold text-white">{req?.storeName || 'Store'}</div>
                          <div className="text-[11px] text-slate-400">{req.email}</div>
                          {req.storeId && (
                            <div className="text-[10px] bg-indigo-500/10 text-indigo-300 px-1.5 py-0.5 rounded inline-block mt-1 border border-indigo-500/20">
                              Store ID: {req.storeId}
                            </div>
                          )}
                        </td>
                        <td className="p-3.5">
                          <div className="font-bold text-white">{req.themeName}</div>
                          <div className="text-[10px] text-slate-400 font-mono uppercase">ID: {req.themeId}</div>
                        </td>
                        <td className="p-3.5 font-bold text-[#D4AF37]">
                          ৳{req.amountBDT.toLocaleString()} BDT
                        </td>
                        <td className="p-3.5 font-semibold text-slate-200 capitalize">
                          {req.paymentMethod}
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono bg-[#181B26] text-pink-400 px-2.5 py-1 rounded border border-[#2E3548] font-bold text-[11px]">
                              {req.transactionId}
                            </span>
                            <button
                              onClick={() => handleCopyToClipboard(req.transactionId)}
                              className="p-1.5 hover:bg-[#3A435E] rounded-lg transition-colors cursor-pointer text-slate-500 hover:text-white"
                            >
                              {copySuccess === req.transactionId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        </td>
                        <td className="p-3.5">
                          <span className={`px-2.5 py-1 rounded-lg font-black uppercase text-[9px] border ${
                            req.status === 'pending_approval' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                            req.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                            'bg-red-500/10 text-red-400 border-red-500/20'
                          }`}>
                            {req.status.replace('_approval', '')}
                          </span>
                        </td>
                        <td className="p-3.5 text-right space-x-2">
                          <button
                            onClick={() => {
                              setSelectedApprovalRequest({...req, type: 'theme'});
                              setIsApprovalDetailsModalOpen(true);
                            }}
                            className="bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase transition cursor-pointer border border-indigo-500/20"
                          >
                            Details
                          </button>
                          {req.status === 'pending_approval' && (
                            <button
                              onClick={() => handleApproveThemePurchase(req.id)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase transition cursor-pointer shadow-lg shadow-emerald-600/20"
                            >
                              Approve
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredThemeRequests.length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-12 text-center text-slate-500">
                          <div className="w-12 h-12 bg-[#202533] rounded-full flex items-center justify-center mx-auto mb-3 text-slate-600">
                            <ShoppingBag className="w-6 h-6" />
                          </div>
                          <p className="font-bold uppercase text-[10px] tracking-widest">No matching theme requests found</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 3. DYNAMIC PAYMENT GATEWAY SETTINGS TAB */}
        {activeSubTab === 'gateways' && (
          <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl p-6 space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-indigo-500" />
                  Live Payment Gateways Configuration
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Manage official account numbers for merchant subscription and theme payments.
                </p>
              </div>
              <button
                onClick={() => setIsCustomGatewayModalOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition shadow-lg shadow-indigo-600/20 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Custom Payment Method</span>
              </button>
            </div>

            {gatewaySavedMessage && (
              <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 p-4 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                <CheckCircle2 className="w-4 h-4" />
                Payment gateways updated and synced successfully!
              </div>
            )}

            <form onSubmit={handleSaveGateways} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* bKash Config */}
                <div className={`bg-[#202533] border transition-all duration-300 rounded-2xl overflow-hidden ${gatewayForm.bkashActive ? 'border-[#2E3548]' : 'border-red-500/20 opacity-60 grayscale'}`}>
                  <div className="p-5 border-b border-[#2E3548] flex items-center justify-between bg-[#181B26]/50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-pink-500 flex items-center justify-center text-white font-black text-xs shadow-lg shadow-pink-500/20">bKash</div>
                      <h4 className="font-bold text-white text-sm">bKash Admin</h4>
                    </div>
                    <div
                      onClick={() => setGatewayForm({...gatewayForm, bkashActive: !gatewayForm.bkashActive})}
                      className={`w-10 h-5 rounded-full transition-all relative cursor-pointer ${gatewayForm.bkashActive ? 'bg-pink-500' : 'bg-slate-700'}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${gatewayForm.bkashActive ? 'left-5.5' : 'left-0.5'}`} />
                    </div>
                  </div>
                  <div className="p-5 space-y-4">
                    <div>
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Merchant Number</label>
                      <input
                        type="text"
                        value={gatewayForm.bkashNumber}
                        onChange={(e) => setGatewayForm({ ...gatewayForm, bkashNumber: e.target.value })}
                        placeholder="018XXXXXXXX"
                        disabled={!gatewayForm.bkashActive}
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:ring-2 focus:ring-pink-500/50 outline-none disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Account Type</label>
                      <select
                        value={gatewayForm.bkashType}
                        onChange={(e) => setGatewayForm({ ...gatewayForm, bkashType: e.target.value })}
                        disabled={!gatewayForm.bkashActive}
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-sm text-white outline-none appearance-none disabled:opacity-50"
                      >
                        <option value="Personal">Personal</option>
                        <option value="Merchant">Merchant</option>
                        <option value="Agent">Agent</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Nagad Config */}
                <div className={`bg-[#202533] border transition-all duration-300 rounded-2xl overflow-hidden ${gatewayForm.nagadActive ? 'border-[#2E3548]' : 'border-red-500/20 opacity-60 grayscale'}`}>
                  <div className="p-5 border-b border-[#2E3548] flex items-center justify-between bg-[#181B26]/50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center text-white font-black text-xs shadow-lg shadow-orange-500/20">Nagad</div>
                      <h4 className="font-bold text-white text-sm">Nagad Admin</h4>
                    </div>
                    <div
                      onClick={() => setGatewayForm({...gatewayForm, nagadActive: !gatewayForm.nagadActive})}
                      className={`w-10 h-5 rounded-full transition-all relative cursor-pointer ${gatewayForm.nagadActive ? 'bg-orange-500' : 'bg-slate-700'}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${gatewayForm.nagadActive ? 'left-5.5' : 'left-0.5'}`} />
                    </div>
                  </div>
                  <div className="p-5 space-y-4">
                    <div>
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Merchant Number</label>
                      <input
                        type="text"
                        value={gatewayForm.nagadNumber}
                        onChange={(e) => setGatewayForm({ ...gatewayForm, nagadNumber: e.target.value })}
                        placeholder="017XXXXXXXX"
                        disabled={!gatewayForm.nagadActive}
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:ring-2 focus:ring-orange-500/50 outline-none disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Account Type</label>
                      <select
                        value={gatewayForm.nagadType}
                        onChange={(e) => setGatewayForm({ ...gatewayForm, nagadType: e.target.value })}
                        disabled={!gatewayForm.nagadActive}
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-sm text-white outline-none appearance-none disabled:opacity-50"
                      >
                        <option value="Personal">Personal</option>
                        <option value="Merchant">Merchant</option>
                        <option value="Agent">Agent</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Rocket Config */}
                <div className={`bg-[#202533] border transition-all duration-300 rounded-2xl overflow-hidden ${gatewayForm.rocketActive ? 'border-[#2E3548]' : 'border-red-500/20 opacity-60 grayscale'}`}>
                  <div className="p-5 border-b border-[#2E3548] flex items-center justify-between bg-[#181B26]/50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center text-white font-black text-xs shadow-lg shadow-violet-600/20">Rocket</div>
                      <h4 className="font-bold text-white text-sm">Rocket Admin</h4>
                    </div>
                    <div
                      onClick={() => setGatewayForm({...gatewayForm, rocketActive: !gatewayForm.rocketActive})}
                      className={`w-10 h-5 rounded-full transition-all relative cursor-pointer ${gatewayForm.rocketActive ? 'bg-violet-600' : 'bg-slate-700'}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${gatewayForm.rocketActive ? 'left-5.5' : 'left-0.5'}`} />
                    </div>
                  </div>
                  <div className="p-5 space-y-4">
                    <div>
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Rocket Number</label>
                      <input
                        type="text"
                        value={gatewayForm.rocketNumber}
                        onChange={(e) => setGatewayForm({ ...gatewayForm, rocketNumber: e.target.value })}
                        placeholder="019XXXXXXXX-X"
                        disabled={!gatewayForm.rocketActive}
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:ring-2 focus:ring-violet-500/50 outline-none disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Account Type</label>
                      <select
                        value={gatewayForm.rocketType}
                        onChange={(e) => setGatewayForm({ ...gatewayForm, rocketType: e.target.value })}
                        disabled={!gatewayForm.rocketActive}
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-sm text-white outline-none appearance-none disabled:opacity-50"
                      >
                        <option value="Personal">Personal</option>
                        <option value="Merchant">Merchant</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Bangla QR Config */}
                <div className={`bg-[#202533] border transition-all duration-300 rounded-2xl overflow-hidden ${gatewayForm.qrActive ? 'border-[#2E3548]' : 'border-red-500/20 opacity-60 grayscale'}`}>
                  <div className="p-5 border-b border-[#2E3548] flex items-center justify-between bg-[#181B26]/50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-600/20">
                        <Smartphone className="w-5 h-5" />
                      </div>
                      <h4 className="font-bold text-white text-sm">QR Payment</h4>
                    </div>
                    <div
                      onClick={() => setGatewayForm({...gatewayForm, qrActive: !gatewayForm.qrActive})}
                      className={`w-10 h-5 rounded-full transition-all relative cursor-pointer ${gatewayForm.qrActive ? 'bg-emerald-600' : 'bg-slate-700'}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${gatewayForm.qrActive ? 'left-5.5' : 'left-0.5'}`} />
                    </div>
                  </div>
                  <div className="p-5 space-y-4">
                    <div>
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">QR Title</label>
                      <input
                        type="text"
                        value={gatewayForm.qrTitle}
                        onChange={(e) => setGatewayForm({ ...gatewayForm, qrTitle: e.target.value })}
                        placeholder="e.g. Bangla QR"
                        disabled={!gatewayForm.qrActive}
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-xs text-white outline-none disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Account Name / ID</label>
                      <input
                        type="text"
                        value={gatewayForm.qrAccountName}
                        onChange={(e) => setGatewayForm({ ...gatewayForm, qrAccountName: e.target.value })}
                        placeholder="e.g. Zid SaaS BD"
                        disabled={!gatewayForm.qrActive}
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-xs text-white outline-none disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">QR Image URL</label>
                      <input
                        type="text"
                        value={gatewayForm.qrImageUrl}
                        onChange={(e) => setGatewayForm({ ...gatewayForm, qrImageUrl: e.target.value })}
                        placeholder="https://..."
                        disabled={!gatewayForm.qrActive}
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-xs text-white outline-none disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>

                {/* Custom Gateways from state */}
                {gatewayForm.customGateways?.map((gateway) => (
                  <div key={gateway.id} className={`bg-[#202533] border transition-all duration-300 rounded-2xl overflow-hidden ${gateway.isActive ? 'border-[#2E3548]' : 'border-red-500/20 opacity-60 grayscale'}`}>
                    <div className="p-5 border-b border-[#2E3548] flex items-center justify-between bg-[#181B26]/50">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-lg">
                          {gateway.logoUrl ? <img src={gateway.logoUrl} className="w-6 h-6 object-contain" alt="" /> : <CreditCard className="w-5 h-5" />}
                        </div>
                        <h4 className="font-bold text-white text-sm">{gateway.name}</h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => removeCustomGateway(gateway.id)}
                          className="p-1.5 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <div
                          onClick={() => toggleCustomGateway(gateway.id)}
                          className={`w-10 h-5 rounded-full transition-all relative cursor-pointer ${gateway.isActive ? 'bg-indigo-600' : 'bg-slate-700'}`}
                        >
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${gateway.isActive ? 'left-5.5' : 'left-0.5'}`} />
                        </div>
                      </div>
                    </div>
                    <div className="p-5 space-y-4">
                      <div>
                        <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Account Details</label>
                        <textarea
                          value={gateway.details}
                          onChange={(e) => {
                            const updated = gatewayForm.customGateways.map(g => g.id === gateway.id ? {...g, details: e.target.value} : g);
                            setGatewayForm({...gatewayForm, customGateways: updated});
                          }}
                          disabled={!gateway.isActive}
                          className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-xs text-white outline-none min-h-[80px] resize-none disabled:opacity-50"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bank Account Grid Row */}
              <div className={`bg-[#202533] border transition-all duration-300 rounded-2xl overflow-hidden ${gatewayForm.bankActive ? 'border-[#2E3548]' : 'border-red-500/20 opacity-60 grayscale'}`}>
                <div className="p-5 border-b border-[#2E3548] flex items-center justify-between bg-[#181B26]/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm">Bank Account Configuration</h4>
                      <p className="text-[10px] text-slate-500">For direct renewals</p>
                    </div>
                  </div>
                  <div
                    onClick={() => setGatewayForm({...gatewayForm, bankActive: !gatewayForm.bankActive})}
                    className={`w-10 h-5 rounded-full transition-all relative cursor-pointer ${gatewayForm.bankActive ? 'bg-blue-600' : 'bg-slate-700'}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${gatewayForm.bankActive ? 'left-5.5' : 'left-0.5'}`} />
                  </div>
                </div>

                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Bank Name</label>
                      <input
                        type="text"
                        value={gatewayForm.bankName}
                        onChange={(e) => setGatewayForm({ ...gatewayForm, bankName: e.target.value })}
                        placeholder="Dutch-Bangla Bank"
                        disabled={!gatewayForm.bankActive}
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-xs text-white outline-none disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Account Name</label>
                      <input
                        type="text"
                        value={gatewayForm.accountName}
                        onChange={(e) => setGatewayForm({ ...gatewayForm, accountName: e.target.value })}
                        placeholder="Zid SaaS BD"
                        disabled={!gatewayForm.bankActive}
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-xs text-white outline-none disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Account Number</label>
                      <input
                        type="text"
                        value={gatewayForm.accountNumber}
                        onChange={(e) => setGatewayForm({ ...gatewayForm, accountNumber: e.target.value })}
                        placeholder="110.120.900..."
                        disabled={!gatewayForm.bankActive}
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-xs text-white font-mono outline-none disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Branch Name</label>
                      <input
                        type="text"
                        value={gatewayForm.branchName}
                        onChange={(e) => setGatewayForm({ ...gatewayForm, branchName: e.target.value })}
                        placeholder="Gulshan 1"
                        disabled={!gatewayForm.bankActive}
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-xs text-white outline-none disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Routing Number</label>
                      <input
                        type="text"
                        value={gatewayForm.routingNumber || ''}
                        onChange={(e) => setGatewayForm({ ...gatewayForm, routingNumber: e.target.value })}
                        placeholder="090271..."
                        disabled={!gatewayForm.bankActive}
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-xs text-white outline-none font-mono disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-[#202533] border border-[#2E3548] p-6 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${gatewayForm.enableManualVerification ? 'bg-indigo-600' : 'bg-slate-700'}`}
                    onClick={() => setGatewayForm({...gatewayForm, enableManualVerification: !gatewayForm.enableManualVerification})}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${gatewayForm.enableManualVerification ? 'left-5' : 'left-1'}`} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">Require Transaction ID (TrxID) for verification</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Recommended to prevent fraudulent approval requests.</div>
                  </div>
                </div>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-8 py-3 rounded-xl text-sm flex items-center gap-2 transition shadow-lg shadow-indigo-600/20 cursor-pointer active:scale-95"
                >
                  <Save className="w-4 h-4" />
                  <span>Update All Gateways</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 4. MERCHANT MANAGEMENT & STORE STATUS TAB */}
        {activeSubTab === 'merchants' && (
          <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-base font-bold text-white">Registered Merchant Stores</h3>
                <p className="text-xs text-slate-400">
                  Manage merchant accounts, extend trial validity, or suspend access.
                </p>
              </div>

              {/* Search input */}
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={merchantSearchQuery}
                    onChange={(e) => {
                      setMerchantSearchQuery(e.target.value);
                      setMerchantCurrentPage(1);
                    }}
                    placeholder="Search store, owner or email..."
                    className="w-full bg-[#202533] border border-[#2E3548] rounded-xl pl-9 pr-4 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500/50"
                  />
                </div>
                <button
                  onClick={() => setIsCreateMerchantModalOpen(true)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition shrink-0 cursor-pointer shadow-lg shadow-indigo-600/20"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Create New Store</span>
                  <span className="sm:hidden">New Store</span>
                </button>
              </div>
            </div>

            {/* QUICK STATUS FILTERS */}
            <div className="flex flex-wrap gap-2 border-b border-[#2E3548] pb-4">
              {[
                { id: 'all', label: 'All Merchants' },
                { id: 'active', label: 'Active Subscriptions' },
                { id: 'trial', label: 'Trial Users' },
                { id: 'suspended', label: 'Suspended / Expired' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setMerchantStatusFilter(tab.id as any);
                    setMerchantCurrentPage(1);
                  }}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer border ${
                    merchantStatusFilter === tab.id
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/20'
                      : 'bg-[#202533] text-slate-400 hover:text-white border-[#2E3548] hover:border-[#3A435E]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#202533] text-slate-400 uppercase font-semibold border-b border-[#2E3548]">
                  <tr>
                    <th className="p-3.5">Store & Owner Name</th>
                    <th className="p-3.5">Contact Email / Phone</th>
                    <th className="p-3.5">SaaS Plan & Expiry</th>
                    <th className="p-3.5">Trial Status</th>
                    <th className="p-3.5">Account Status</th>
                    <th className="p-3.5 text-right">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2E3548]">
                  {paginatedMerchants.map((m, idx) => (
                    <tr key={idx} className="hover:bg-[#202533]/50 transition">
                      <td className="p-3.5">
                        <div className="font-bold text-white flex items-center gap-2">
                          <span>{m?.storeName || ''}</span>
                          <span className="text-[10px] text-[#D4AF37] font-mono">/{m?.storeSlug || ''}</span>
                        </div>
                        <div className="text-[11px] text-slate-400">{m?.ownerName || ''}</div>
                      </td>
                      <td className="p-3.5">
                        <div className="text-white">{m?.email || ''}</div>
                        <div className="text-[11px] text-slate-400">{m?.phone || ''}</div>
                      </td>
                      <td className="p-3.5">
                        <div className="font-bold text-white uppercase">{getPlanDisplayName(m?.subscriptionPlan)}</div>
                        {m?.subscriptionExpiry && m.subscriptionPlan !== 'free_trial' && m.subscriptionPlan !== 'trial' ? (
                          <div className="text-[11px] text-emerald-400 font-mono flex items-center gap-1 mt-0.5">
                            <span>Exp: {m.subscriptionExpiry}</span>
                            <span className="text-slate-400 font-sans">({calculateRemainingDays(m.subscriptionExpiry)}d left)</span>
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400">
                            {m?.subscriptionExpiry ? `Exp: ${m.subscriptionExpiry}` : '30-Day Free Trial'}
                          </div>
                        )}
                      </td>
                      <td className="p-3.5">
                        {m.subscriptionPlan === 'trial' || m.subscriptionPlan === 'free_trial' ? (
                          <span className={`${
                            (() => {
                              const endsAt = m.trialEndsAt ? new Date(m.trialEndsAt) : null;
                              const rem = endsAt
                                ? Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                                : (m.trialDaysRemaining ?? 0);
                              return rem <= 5 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
                            })()
                          } px-2.5 py-1 rounded-full font-bold text-[11px]`}>
                            {(() => {
                              const endsAt = m.trialEndsAt ? new Date(m.trialEndsAt) : null;
                              return endsAt
                                ? Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                                : (m.trialDaysRemaining ?? 0);
                            })()} Days Left
                          </span>
                        ) : (
                          <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-full font-bold text-[11px] inline-flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            Active Subscribed
                          </span>
                        )}
                      </td>
                      <td className="p-3.5">
                        {m?.isLocked ? (
                          <span className="bg-red-500/20 text-red-400 px-2.5 py-1 rounded-full font-bold flex items-center gap-1 w-fit">
                            <Lock className="w-3 h-3" /> Suspended
                          </span>
                        ) : (
                          <span className="bg-[#D4AF37]/20 text-[#D4AF37] px-2.5 py-1 rounded-full font-bold flex items-center gap-1 w-fit">
                            <Unlock className="w-3 h-3" /> Active
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-right space-x-2">
                        <button
                          onClick={() => onLoginAsMerchant(m)}
                          className="bg-indigo-500/10 hover:bg-indigo-500 text-indigo-400 hover:text-white p-2 rounded-lg transition-all border border-indigo-500/20 cursor-pointer inline-flex items-center justify-center"
                          title="Login as Store"
                        >
                          <LogInIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleChangePlan(m?.storeName || '')}
                          className="bg-amber-500/10 hover:bg-amber-500 text-amber-400 hover:text-white p-2 rounded-lg transition-all border border-amber-500/20 cursor-pointer inline-flex items-center justify-center"
                          title="Change Plan"
                        >
                          <UserCog className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleLockMerchant(m?.storeName || '')}
                          className={`p-2 rounded-lg transition-all border cursor-pointer inline-flex items-center justify-center ${
                            m?.isLocked
                              ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white border-emerald-500/20'
                              : 'bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white border-red-500/20'
                          }`}
                          title={m?.isLocked ? "Unsuspend Store" : "Suspend Store"}
                        >
                          {m?.isLocked ? <Unlock className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleDeleteMerchant(m?.storeSlug || '', m?.storeName || '')}
                          className="bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white p-2 rounded-lg transition-all border border-red-500/20 cursor-pointer inline-flex items-center justify-center"
                          title="Delete Merchant"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleExtendTrial(m?.storeName || '', 7)}
                          className="bg-[#282E3F] hover:bg-[#32394E] text-slate-200 px-2.5 py-1.5 rounded-lg font-bold transition border border-[#3A435E] cursor-pointer text-[10px]"
                          title="Extend Trial by 7 Days"
                        >
                          +7d
                        </button>
                        <button
                          onClick={() => handleExtendTrial(m?.storeName || '', 30)}
                          className="bg-[#282E3F] hover:bg-[#32394E] text-slate-200 px-2.5 py-1.5 rounded-lg font-bold transition border border-[#3A435E] cursor-pointer text-[10px]"
                          title="Extend Trial by 30 Days"
                        >
                          +30d
                        </button>
                      </td>
                    </tr>
                  ))}
                  {paginatedMerchants.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-slate-500 italic">
                        No merchants found matching the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* PAGINATION BAR */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-[#2E3548]">
              <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest">
                Showing {filteredMerchants.length > 0 ? (merchantCurrentPage - 1) * merchantItemsPerPage + 1 : 0}-
                {Math.min(filteredMerchants.length, merchantCurrentPage * merchantItemsPerPage)} of {filteredMerchants.length} Merchants
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMerchantCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={merchantCurrentPage === 1}
                  className="p-2.5 rounded-xl bg-[#202533] border border-[#2E3548] text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-1.5">
                  {totalMerchantPages > 0 && Array.from({ length: totalMerchantPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setMerchantCurrentPage(i + 1)}
                      className={`w-8 h-8 rounded-xl text-[10px] font-black transition-all cursor-pointer border ${
                        merchantCurrentPage === i + 1
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/20'
                          : 'bg-[#202533] text-slate-500 hover:text-slate-300 border-[#2E3548]'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setMerchantCurrentPage(prev => Math.min(totalMerchantPages, prev + 1))}
                  disabled={merchantCurrentPage === totalMerchantPages || totalMerchantPages === 0}
                  className="p-2.5 rounded-xl bg-[#202533] border border-[#2E3548] text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 5. SUBSCRIPTION PLANS CONFIGURATOR */}
        {activeSubTab === 'plans' && (
          <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-base font-bold text-white">Subscription Plans Configurator</h3>
                <p className="text-xs text-slate-400">Edit monthly/yearly prices and feature lists for Starter, Pro, and Enterprise plans.</p>
              </div>
              <button
                onClick={handleAddPlan}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-black px-5 py-2.5 rounded-xl text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/20 cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Add New Plan</span>
              </button>
            </div>

            {saveSuccess && (
              <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 p-4 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                <CheckCircle2 className="w-4 h-4" />
                {saveSuccess}
              </div>
            )}

            <form onSubmit={handleSavePlans} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                {plansForm.map((plan, planIdx) => (
                  <div key={plan.id} className={`bg-[#202533] border p-5 rounded-xl space-y-4 hover:border-indigo-500/30 transition-all duration-300 shadow-xl relative ${plan.isPopular ? 'border-indigo-500/50 ring-1 ring-indigo-500/20' : 'border-[#2E3548]'}`}>
                    {plan.isPopular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[9px] font-black uppercase px-3 py-1 rounded-full shadow-lg border border-indigo-400/30 z-10">
                        Popular Choice
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="bg-indigo-600/20 p-2 rounded-lg">
                          <ShoppingBag className="w-4 h-4 text-indigo-400" />
                        </div>
                        <h4 className="font-bold text-white text-sm">{plan.name}</h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDeletePlan(plan.id)}
                          className="p-2 text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded font-black uppercase tracking-wider">{plan.badge}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Plan Name</label>
                        <input
                          type="text"
                          value={plan.name}
                          onChange={(e) => {
                            const newPlans = [...plansForm];
                            newPlans[planIdx].name = e.target.value;
                            setPlansForm(newPlans);
                          }}
                          className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Badge Text</label>
                        <input
                          type="text"
                          value={plan.badge}
                          onChange={(e) => {
                            const newPlans = [...plansForm];
                            newPlans[planIdx].badge = e.target.value;
                            setPlansForm(newPlans);
                          }}
                          className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Price (BDT)</label>
                        <input
                          type="number"
                          value={plan.price}
                          onChange={(e) => {
                            const newPlans = [...plansForm];
                            newPlans[planIdx].price = parseInt(e.target.value) || 0;
                            setPlansForm(newPlans);
                          }}
                          className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Duration (Days)</label>
                        <input
                          type="number"
                          value={plan.durationDays}
                          onChange={(e) => {
                            const newPlans = [...plansForm];
                            newPlans[planIdx].durationDays = parseInt(e.target.value) || 0;
                            setPlansForm(newPlans);
                          }}
                          className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-6 py-2 border-t border-b border-[#2E3548]">
                      <div className="flex items-center justify-between gap-3 flex-1">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black uppercase text-white">Active Status</span>
                          <span className="text-[9px] text-slate-500">Enable or hide this plan from merchants</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const newPlans = [...plansForm];
                            newPlans[planIdx].isActive = !plan.isActive;
                            setPlansForm(newPlans);
                          }}
                          className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${plan.isActive ? 'bg-indigo-600' : 'bg-slate-700'}`}
                        >
                          <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${plan.isActive ? 'left-6' : 'left-1'}`} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-3 flex-1">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black uppercase text-white">Popular Choice</span>
                          <span className="text-[9px] text-slate-500">Show popular badge on this plan</span>
                        </div>
                        <label className="relative flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={plan.isPopular || false}
                            onChange={() => {
                              const newPlans = [...plansForm];
                              newPlans[planIdx].isPopular = !plan.isPopular;
                              setPlansForm(newPlans);
                            }}
                          />
                          <div className={`w-5 h-5 border-2 rounded transition-all flex items-center justify-center ${plan.isPopular ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600 bg-transparent'}`}>
                            {plan.isPopular && <Check className="w-3.5 h-3.5 text-white" />}
                          </div>
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Features (One per line)</label>
                      <textarea
                        value={plan.features.join('\n')}
                        onChange={(e) => {
                          const newPlans = [...plansForm];
                          newPlans[planIdx].features = e.target.value.split('\n').filter(f => f.trim() !== '');
                          setPlansForm(newPlans);
                        }}
                        rows={4}
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-xs text-white focus:ring-2 focus:ring-indigo-500/50 outline-none resize-none"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-8 py-3 rounded-xl text-sm flex items-center gap-2 transition shadow-lg shadow-indigo-600/20 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Update Subscription Plans</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 6. ANNOUNCEMENT / NOTICE BANNER TAB */}
        {activeSubTab === 'announcements' && (
          <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl p-6 space-y-6">
            <div>
              <h3 className="text-base font-bold text-white">Announcements / Notice Banner Control</h3>
              <p className="text-xs text-slate-400">Broadcast a global alert banner visible to all logged-in merchants inside their dashboard.</p>
            </div>

            {saveSuccess && (
              <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 p-4 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                <CheckCircle2 className="w-4 h-4" />
                {saveSuccess}
              </div>
            )}

            <form onSubmit={handleSaveAnnouncement} className="space-y-6">
              <div className="bg-[#202533] border border-[#2E3548] p-6 rounded-xl space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-500">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm">Global Notice Configuration</h4>
                      <p className="text-[10px] text-slate-500">Enable or disable the banner and edit the text.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-7 rounded-full transition-colors relative cursor-pointer ${announcementForm.isActive ? 'bg-amber-500' : 'bg-slate-700'}`}
                      onClick={() => setAnnouncementForm({...announcementForm, isActive: !announcementForm.isActive})}
                    >
                      <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${announcementForm.isActive ? 'left-6' : 'left-1'}`} />
                    </div>
                    <span className="text-xs font-bold text-slate-300">{announcementForm.isActive ? 'Banner Active' : 'Banner Hidden'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Announcement Type</label>
                    <select
                      value={announcementForm.type}
                      onChange={(e) => setAnnouncementForm({...announcementForm, type: e.target.value as any})}
                      className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-amber-500/50 outline-none appearance-none cursor-pointer transition-all"
                    >
                      <option value="Info">Info (Amber)</option>
                      <option value="Critical Alert">Critical Alert (Red)</option>
                      <option value="Success Announcement">Success Announcement (Green)</option>
                      <option value="System Maintenance">System Maintenance (Purple)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Target Audience</label>
                    <select
                      value={announcementForm.targetAudience}
                      onChange={(e) => setAnnouncementForm({...announcementForm, targetAudience: e.target.value as any})}
                      className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-amber-500/50 outline-none appearance-none cursor-pointer transition-all"
                    >
                      <option value="All Merchants">All Merchants</option>
                      <option value="Free Trial Users Only">Free Trial Users Only</option>
                      <option value="Subscribed Merchants Only">Subscribed Merchants Only</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">CTA Button Text (Optional)</label>
                    <input
                      type="text"
                      value={announcementForm.ctaText || ''}
                      onChange={(e) => setAnnouncementForm({...announcementForm, ctaText: e.target.value})}
                      placeholder="e.g. Upgrade Now"
                      className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-amber-500/50 outline-none transition-all placeholder:text-slate-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">CTA Link URL (Optional)</label>
                    <input
                      type="text"
                      value={announcementForm.ctaUrl || ''}
                      onChange={(e) => setAnnouncementForm({...announcementForm, ctaUrl: e.target.value})}
                      placeholder="e.g. https://zid.com/pricing"
                      className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-amber-500/50 outline-none transition-all placeholder:text-slate-600"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Announcement Message</label>
                  <textarea
                    value={announcementForm.message}
                    onChange={(e) => setAnnouncementForm({...announcementForm, message: e.target.value})}
                    placeholder="Enter announcement message..."
                    rows={3}
                    className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-amber-500/50 outline-none resize-none transition-all placeholder:text-slate-600"
                  />
                </div>

                {announcementForm.isActive && (
                  <div className="bg-[#181B26] border border-[#2E3548] rounded-xl p-5 shadow-inner">
                    <div className="text-[10px] uppercase font-black text-slate-500 mb-3 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      Live Banner Preview
                    </div>
                    <div className={`py-3 px-6 flex flex-col sm:flex-row items-center justify-center gap-4 text-center rounded-xl shadow-2xl transition-all duration-500 ${
                      announcementForm.type === 'Critical Alert' ? 'bg-red-600 text-white' :
                      announcementForm.type === 'Success Announcement' ? 'bg-emerald-600 text-white' :
                      announcementForm.type === 'System Maintenance' ? 'bg-purple-600 text-white' :
                      'bg-amber-500 text-slate-950'
                    }`}>
                      <p className="text-[11px] font-black uppercase tracking-[0.05em]">
                        {announcementForm.message || 'Announcement text here...'}
                      </p>
                      {announcementForm.ctaText && (
                        <button className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase shadow-lg transition-transform active:scale-95 ${
                          announcementForm.type === 'Critical Alert' || announcementForm.type === 'Success Announcement' || announcementForm.type === 'System Maintenance'
                            ? 'bg-white text-slate-900 hover:bg-slate-100'
                            : 'bg-slate-950 text-white hover:bg-slate-900'
                        }`}>
                          {announcementForm.ctaText}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-8 py-3 rounded-xl text-sm flex items-center gap-2 transition shadow-lg shadow-amber-600/20 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Update Announcement</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 7. PLATFORM SETTINGS TAB */}
        {activeSubTab === 'settings' && (
          <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl p-6 space-y-6">
            <div>
              <h3 className="text-base font-bold text-white">Platform Configuration & Defaults</h3>
              <p className="text-xs text-slate-400">Modify site-wide branding, support info, and legal links.</p>
            </div>

            {saveSuccess && (
              <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 p-4 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                <CheckCircle2 className="w-4 h-4" />
                {saveSuccess}
              </div>
            )}

            <form onSubmit={handleSaveSettings} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* BRANDING & ASSETS */}
                <div className="bg-[#202533] border border-[#2E3548] p-6 rounded-xl space-y-4">
                  <h4 className="font-bold text-white text-sm flex items-center gap-2">
                    <Image className="w-4 h-4 text-indigo-400" />
                    Branding & Assets
                  </h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Platform Site Title</label>
                      <input
                        type="text"
                        required
                        value={settingsForm.siteTitle}
                        onChange={(e) => setSettingsForm({...settingsForm, siteTitle: e.target.value})}
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                        placeholder="e.g. Zid SaaS BD"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Platform Logo</label>
                        <div className="flex items-center gap-3">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  setSettingsForm({...settingsForm, logoUrl: reader.result as string});
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                            className="text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[#2E3548] file:text-white hover:file:bg-[#3A435E] cursor-pointer"
                          />
                          {settingsForm.logoUrl && (
                            <img src={settingsForm.logoUrl} alt="Logo Preview" className="w-10 h-10 rounded-lg object-contain border border-[#2E3548]" />
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Favicon</label>
                        <div className="flex items-center gap-3">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  setSettingsForm({...settingsForm, faviconUrl: reader.result as string});
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                            className="text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[#2E3548] file:text-white hover:file:bg-[#3A435E] cursor-pointer"
                          />
                          {settingsForm.faviconUrl && (
                            <img src={settingsForm.faviconUrl} alt="Favicon Preview" className="w-8 h-8 rounded-full object-contain border border-[#2E3548]" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SUPPORT & CONTACT */}
                <div className="bg-[#202533] border border-[#2E3548] p-6 rounded-xl space-y-4">
                  <h4 className="font-bold text-white text-sm flex items-center gap-2">
                    <LifeBuoy className="w-4 h-4 text-emerald-400" />
                    Support & Contact
                  </h4>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Support Phone</label>
                        <input
                          type="text"
                          value={settingsForm.supportPhone}
                          onChange={(e) => setSettingsForm({...settingsForm, supportPhone: e.target.value})}
                          className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                          placeholder="+880..."
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Support Email</label>
                        <input
                          type="email"
                          value={settingsForm.supportEmail}
                          onChange={(e) => setSettingsForm({...settingsForm, supportEmail: e.target.value})}
                          className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                          placeholder="support@..."
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Office Address</label>
                      <textarea
                        value={settingsForm.supportAddress}
                        onChange={(e) => setSettingsForm({...settingsForm, supportAddress: e.target.value})}
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none min-h-[80px] resize-none"
                        placeholder="Enter full office address..."
                      />
                    </div>
                  </div>
                </div>

                {/* LOCALIZATION & FINANCE */}
                <div className="bg-[#202533] border border-[#2E3548] p-6 rounded-xl space-y-4">
                  <h4 className="font-bold text-white text-sm flex items-center gap-2">
                    <Coins className="w-4 h-4 text-amber-400" />
                    Localization & Finance
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Currency Symbol</label>
                      <input
                        type="text"
                        value={settingsForm.currencySymbol}
                        onChange={(e) => setSettingsForm({...settingsForm, currencySymbol: e.target.value})}
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                        placeholder="৳ BDT"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Default Tax Rate (%)</label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          value={settingsForm.taxRate}
                          onChange={(e) => setSettingsForm({...settingsForm, taxRate: parseFloat(e.target.value) || 0})}
                          className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none pr-10"
                        />
                        <Percent className="w-4 h-4 text-slate-500 absolute right-4 top-3" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* SOCIAL & HELP LINKS */}
                <div className="bg-[#202533] border border-[#2E3548] p-6 rounded-xl space-y-4">
                  <h4 className="font-bold text-white text-sm flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-blue-400" />
                    Social & Help Links
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Facebook Page URL</label>
                      <div className="relative">
                        <input
                          type="url"
                          value={settingsForm.facebookUrl}
                          onChange={(e) => setSettingsForm({...settingsForm, facebookUrl: e.target.value})}
                          className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                          placeholder="https://..."
                        />
                        <Facebook className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">WhatsApp Number</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={settingsForm.whatsappNumber}
                          onChange={(e) => setSettingsForm({...settingsForm, whatsappNumber: e.target.value})}
                          className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                          placeholder="+880..."
                        />
                        <Smartphone className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* TRIAL & LEGAL */}
                <div className="bg-[#202533] border border-[#2E3548] p-6 rounded-xl space-y-4 md:col-span-2">
                  <h4 className="font-bold text-white text-sm flex items-center gap-2">
                    <Lock className="w-4 h-4 text-pink-400" />
                    Trial & Legal
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Global Free Trial (Days)</label>
                      <input
                        type="number"
                        value={settingsForm.globalTrialDays}
                        onChange={(e) => setSettingsForm({...settingsForm, globalTrialDays: parseInt(e.target.value) || 0})}
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Terms URL</label>
                      <input
                        type="text"
                        value={settingsForm.termsUrl}
                        onChange={(e) => setSettingsForm({...settingsForm, termsUrl: e.target.value})}
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Privacy URL</label>
                      <input
                        type="text"
                        value={settingsForm.privacyUrl}
                        onChange={(e) => setSettingsForm({...settingsForm, privacyUrl: e.target.value})}
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* AI FREEMIUM CONTROL */}
                <div className="bg-[#202533] border border-[#2E3548] p-6 rounded-xl space-y-4 md:col-span-2">
                  <h4 className="font-bold text-white text-sm flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    AI Tool Freemium Controls
                  </h4>
                  <p className="text-xs text-slate-400 mb-4">Select which AI-powered tools require a paid PRO subscription. Free tools are available to all trial and starter users.</p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="flex items-center justify-between p-4 bg-[#181B26] border border-[#2E3548] rounded-xl">
                      <div className="flex-1 pr-4">
                        <div className="text-xs font-bold text-white">AI Content Generator</div>
                        <div className="text-[10px] text-slate-500">Product titles & descriptions</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSettingsForm({...settingsForm, aiContentProOnly: !settingsForm.aiContentProOnly})}
                        className={`w-10 h-5 rounded-full transition-all relative cursor-pointer shrink-0 ${settingsForm.aiContentProOnly ? 'bg-indigo-600' : 'bg-slate-700'}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${settingsForm.aiContentProOnly ? 'left-5.5' : 'left-0.5'}`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-[#181B26] border border-[#2E3548] rounded-xl">
                      <div className="flex-1 pr-4">
                        <div className="text-xs font-bold text-white">WhatsApp AI Marketing</div>
                        <div className="text-[10px] text-slate-500">Auto-generated sales copy</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSettingsForm({...settingsForm, aiWhatsAppMarketingProOnly: !settingsForm.aiWhatsAppMarketingProOnly})}
                        className={`w-10 h-5 rounded-full transition-all relative cursor-pointer shrink-0 ${settingsForm.aiWhatsAppMarketingProOnly ? 'bg-indigo-600' : 'bg-slate-700'}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${settingsForm.aiWhatsAppMarketingProOnly ? 'left-5.5' : 'left-0.5'}`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-[#181B26] border border-[#2E3548] rounded-xl">
                      <div className="flex-1 pr-4">
                        <div className="text-xs font-bold text-white">AI Background Remover</div>
                        <div className="text-[10px] text-slate-500">One-click image cleanup</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSettingsForm({...settingsForm, aiBgRemoverProOnly: !settingsForm.aiBgRemoverProOnly})}
                        className={`w-10 h-5 rounded-full transition-all relative cursor-pointer shrink-0 ${settingsForm.aiBgRemoverProOnly ? 'bg-indigo-600' : 'bg-slate-700'}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${settingsForm.aiBgRemoverProOnly ? 'left-5.5' : 'left-0.5'}`} />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-2 px-1">
                    <ShieldAlert className="w-4 h-4 text-slate-500" />
                    <span className="text-[10px] text-slate-500 font-medium italic">Smart Sales Copilot / Chatbot remains FREE by system default.</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-8 py-3 rounded-xl text-sm flex items-center gap-2 transition shadow-lg shadow-indigo-600/20 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Update Platform Configuration</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 10. ADD-ONS MANAGER TAB */}
        {activeSubTab === 'addons' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Platform Add-ons & Extensions</h3>
                <p className="text-xs text-slate-400">Manage features and apps available for merchants to install.</p>
              </div>
              <button
                onClick={handleOpenAddAddon}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition shadow-lg shadow-indigo-600/20 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add New Add-on</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#181B26] border border-[#2E3548] p-4 rounded-2xl">
                <div className="text-[10px] text-slate-500 uppercase font-black mb-1">Total Add-ons</div>
                <div className="text-xl font-bold text-white">{platformAddons.length}</div>
              </div>
              <div className="bg-[#181B26] border border-[#2E3548] p-4 rounded-2xl">
                <div className="text-[10px] text-slate-500 uppercase font-black text-emerald-500 mb-1">Published Apps</div>
                <div className="text-xl font-bold text-white">{platformAddons.filter(a => a.isPublished).length}</div>
              </div>
              <div className="bg-[#181B26] border border-[#2E3548] p-4 rounded-2xl">
                <div className="text-[10px] text-slate-500 uppercase font-black text-indigo-400 mb-1">Premium Extensions</div>
                <div className="text-xl font-bold text-white">{platformAddons.filter(a => a.pricingType !== 'Free').length}</div>
              </div>
            </div>

            {saveSuccess && (
              <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 p-4 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                <CheckCircle2 className="w-4 h-4" />
                {saveSuccess}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {platformAddons.map((addon) => (
                <div key={addon.id} className="bg-[#181B26] border border-[#2E3548] rounded-2xl p-5 hover:border-indigo-500/50 transition-all duration-300 shadow-xl flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-12 h-12 bg-indigo-600/10 rounded-2xl flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                        {/* Dynamic Icon Rendering based on string - mapping common icons or default to Box */}
                        {addon.icon === 'Target' && <Target className="w-6 h-6" />}
                        {addon.icon === 'Globe' && <Globe className="w-6 h-6" />}
                        {addon.icon === 'MessageSquare' && <MessageSquare className="w-6 h-6" />}
                        {addon.icon === 'Cpu' && <Cpu className="w-6 h-6" />}
                        {!['Target', 'Globe', 'MessageSquare', 'Cpu'].includes(addon.icon) && <Box className="w-6 h-6" />}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleOpenEditAddon(addon)} className="p-2 text-slate-400 hover:text-white transition">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteAddon(addon.id)} className="p-2 text-slate-400 hover:text-red-400 transition">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1 mb-4">
                      <h4 className="font-bold text-white text-base">{addon.name}</h4>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 uppercase font-black tracking-wider">{addon.category}</span>
                        <span className="text-slate-700">•</span>
                        <span className={`text-[10px] font-black uppercase ${addon.isPublished ? 'text-emerald-500' : 'text-slate-500'}`}>
                          {addon.isPublished ? 'Published' : 'Hidden'}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed mb-6">{addon.description}</p>
                  </div>
                  <div className="mt-auto pt-4 border-t border-[#2E3548]">
                    <div className="bg-[#202533] px-4 py-3 rounded-xl flex items-center justify-between border border-[#3A435E]/30">
                      <div className="text-[9px] text-slate-400 uppercase font-black tracking-widest">{addon.pricingType}</div>
                      <div className={`text-[10px] font-black uppercase px-3 py-1.5 rounded-lg border shadow-lg ${
                        addon.pricingType === 'Free'
                          ? 'bg-amber-500 text-white border-amber-600/50 shadow-amber-500/20'
                          : 'bg-indigo-600 text-white border-indigo-700/50 shadow-indigo-600/20'
                      }`}>
                        {addon.pricingType === 'Free' ? 'FREE' : `৳${addon.price}${addon.pricingType === 'Monthly Recurring' ? '/MO' : ''}`}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {platformAddons.length === 0 && (
                <div className="col-span-full py-20 text-center space-y-4">
                  <div className="w-16 h-16 bg-[#202533] rounded-full flex items-center justify-center mx-auto text-slate-600">
                    <Box className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-slate-400 font-bold">No add-ons found</p>
                    <p className="text-xs text-slate-500">Create your first platform extension.</p>
                  </div>
                  <button
                    onClick={handleOpenAddAddon}
                    className="bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white px-6 py-2 rounded-xl text-xs font-bold transition border border-indigo-500/20"
                  >
                    Add First Add-on
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 13. ADMIN TEAM TAB */}
        {activeSubTab === 'team' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <h3 className="text-base font-bold text-white">Platform Administration Team</h3>
                  <p className="text-xs text-slate-400">Manage team members, roles, and platform access permissions.</p>
                </div>
                <button
                  onClick={handleOpenAddMember}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition shadow-lg shadow-indigo-600/20 cursor-pointer h-fit"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Invite Admin</span>
                </button>
              </div>
            </div>

            {saveSuccess && (
              <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 p-4 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                <CheckCircle2 className="w-4 h-4" />
                {saveSuccess}
              </div>
            )}

            <div className="grid grid-cols-12 gap-6">
              {/* TEAM MEMBERS TABLE */}
              <div className="col-span-12 xl:col-span-7">
                <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl overflow-hidden">
                  <div className="p-4 bg-[#202533] border-b border-[#2E3548]">
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      <Users className="w-4 h-4 text-slate-400" />
                      Active Administrators
                    </h4>
                  </div>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#202533]/50 text-[10px] uppercase font-black text-slate-500 border-b border-[#2E3548]">
                        <th className="p-4">Name & Email</th>
                        <th className="p-4">Role</th>
                        <th className="p-4">Last Active</th>
                        <th className="p-4 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2E3548]">
                      {adminTeam.map((member) => (
                        <tr key={member.id} className="hover:bg-[#202533]/30 transition-colors">
                          <td className="p-4">
                            <div className="text-xs font-bold text-white">{member.fullName}</div>
                            <div className="text-[10px] text-slate-500">{member.email}</div>
                          </td>
                          <td className="p-4">
                            <span className="text-[10px] font-black uppercase text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                              {member.role}
                            </span>
                          </td>
                          <td className="p-4 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            {member.lastActive !== 'Never' ? new Date(member.lastActive).toLocaleString() : 'Never'}
                          </td>
                          <td className="p-4 text-right">
                            <div
                              className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ml-auto ${member.status === 'Active' ? 'bg-emerald-600' : 'bg-slate-700'}`}
                              onClick={() => toggleMemberStatus(member.id)}
                            >
                              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${member.status === 'Active' ? 'left-5' : 'left-1'}`} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* PERMISSIONS MATRIX */}
              <div className="col-span-12 xl:col-span-5 space-y-6">
                <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl p-6 space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="bg-indigo-600/20 p-2.5 rounded-xl">
                      <Key className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Role Permission Matrix</h4>
                      <p className="text-[10px] text-slate-500">Customize tab access for specific roles.</p>
                    </div>
                  </div>

                  <div className="space-y-4 max-h-[550px] overflow-y-auto no-scrollbar">
                    {rolePermissions.filter(rp => rp.role !== 'Super Admin').map((rp) => (
                      <div key={rp.role} className="p-4 bg-[#202533] rounded-xl border border-[#2E3548] space-y-3">
                        <div className="text-xs font-bold text-white border-b border-[#3A435E] pb-2 mb-2 flex items-center justify-between">
                          <span>{rp.role}</span>
                          <span className="text-[9px] text-slate-500">{rp.allowedTabs.length} Tabs Allowed</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {['analytics', 'merchants', 'support', 'broadcast', 'addons', 'gateways', 'plans', 'themes', 'announcements'].map(tabId => (
                            <div
                              key={tabId}
                              onClick={() => handleTogglePermission(rp.role, tabId)}
                              className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition ${
                                rp.allowedTabs.includes(tabId)
                                  ? 'bg-indigo-600/10 border-indigo-500/30 text-indigo-400'
                                  : 'bg-[#181B26] border-transparent text-slate-500 hover:text-slate-400'
                              }`}
                            >
                              <CheckSquare className={`w-3 h-3 ${rp.allowedTabs.includes(tabId) ? 'opacity-100' : 'opacity-20'}`} />
                              <span className="text-[9px] uppercase font-black tracking-widest">{tabId}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 flex gap-4">
                  <div className="bg-amber-500/20 p-3 rounded-xl shrink-0 h-fit">
                    <Lock className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Super Admin Access</h4>
                    <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                      Super Admin role always has access to all platform features and settings. This cannot be modified.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 12. BROADCAST & EMAILS TAB */}
        {activeSubTab === 'broadcast' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Broadcast & Communication Center</h3>
                <p className="text-xs text-slate-400">Send platform-wide announcements and manage automated system emails.</p>
              </div>
            </div>

            {saveSuccess && (
              <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 p-4 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                <CheckCircle2 className="w-4 h-4" />
                {saveSuccess}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
              {/* SEND BROADCAST FORM */}
              <div className="lg:col-span-2 flex flex-col">
                {/* AI Broadcast Helper */}
                <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl p-6 mb-6 space-y-4">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-indigo-400" />
                    AI Broadcast Helper
                  </h4>
                  <div className="flex gap-2">
                    <input type="text" placeholder="e.g. Promote our new AI features to all merchants" className="flex-1 bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-2 text-sm text-white outline-none" id="broadcastTopic" />
                    <button
                      onClick={async () => {
                        const topic = (document.getElementById('broadcastTopic') as HTMLInputElement).value;
                        if (!topic) return;
                        setIsGeneratingBroadcast(true);
                        try {
                          const response = await fetch('/api/ai/broadcast-email', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ topic, targetAudience: broadcastForm.audience })
                          });
                          const data = await response.json();
                          setBroadcastDraft(data.emailContent);
                          setBroadcastForm({...broadcastForm, message: data.emailContent});
                        } catch (e) {
                          setBroadcastDraft('Failed to generate.');
                        } finally {
                          setIsGeneratingBroadcast(false);
                        }
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition"
                    >
                      {isGeneratingBroadcast ? 'Writing...' : 'Generate AI Email'}
                    </button>
                  </div>
                </div>

                <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl p-6 space-y-6 flex-1 flex flex-col">
                  <div className="flex items-center gap-3">
                    <div className="bg-indigo-600/20 p-2.5 rounded-xl">
                      <Zap className="w-5 h-5 text-indigo-400" />
                    </div>
                    <h4 className="text-sm font-bold text-white">Send Mass Broadcast</h4>
                  </div>

                  <form onSubmit={handleSendBroadcast} className="space-y-5 flex-1 flex flex-col">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Target Audience</label>
                        <select
                          value={broadcastForm.audience}
                          onChange={(e) => setBroadcastForm({...broadcastForm, audience: e.target.value as any})}
                          className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none cursor-pointer transition-all"
                        >
                          <option value="All Merchants">All Merchants</option>
                          <option value="Free Trial Users">Free Trial Users</option>
                          <option value="Paid Subscriptions">Paid Subscriptions</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Message Type</label>
                        <select
                          value={broadcastForm.type}
                          onChange={(e) => setBroadcastForm({...broadcastForm, type: e.target.value as any})}
                          className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none cursor-pointer transition-all"
                        >
                          <option value="In-App Announcement">In-App Announcement</option>
                          <option value="Email Alert">Email Alert</option>
                          <option value="Both">Both (App + Email)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Subject Line</label>
                      <input
                        type="text"
                        required
                        value={broadcastForm.subject}
                        onChange={(e) => setBroadcastForm({...broadcastForm, subject: e.target.value})}
                        placeholder="e.g. Important Platform Update"
                        className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all placeholder:text-slate-600"
                      />
                    </div>

                    <div className="flex-1">
                      <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Message Body</label>
                      <textarea
                        required
                        value={broadcastForm.body}
                        onChange={(e) => setBroadcastForm({...broadcastForm, body: e.target.value})}
                        placeholder="Write your announcement message here..."
                        className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none min-h-[120px] h-full resize-none transition-all placeholder:text-slate-600"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer focus:ring-4 focus:ring-indigo-500/30 outline-none active:scale-[0.98]"
                    >
                      <Send className="w-4 h-4" />
                      <span>Send Broadcast Now</span>
                    </button>
                  </form>
                </div>
              </div>

              {/* AUTOMATION SETTINGS */}
              <div className="flex flex-col">
                <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl p-6 space-y-6 flex-1 flex flex-col">
                  <div className="flex items-center gap-3">
                    <div className="bg-amber-500/20 p-2.5 rounded-xl">
                      <Mail className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Automation Triggers</h4>
                      <p className="text-[10px] text-slate-500">Enable automatic system-generated emails.</p>
                    </div>
                  </div>

                  <div className="space-y-4 flex-1">
                    <div className="flex items-center justify-between p-3 bg-[#202533] rounded-xl border border-[#2E3548]">
                      <div>
                        <div className="text-xs font-bold text-white">Subscription Expiry</div>
                        <div className="text-[9px] text-slate-500 mt-0.5">3 days before expiration alert.</div>
                      </div>
                      <div
                        className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${automationSettings.subscriptionExpiryWarning ? 'bg-indigo-600' : 'bg-slate-700'}`}
                        onClick={() => onUpdateAutomationSettings({...automationSettings, subscriptionExpiryWarning: !automationSettings.subscriptionExpiryWarning})}
                      >
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${automationSettings.subscriptionExpiryWarning ? 'left-5' : 'left-1'}`} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-[#202533] rounded-xl border border-[#2E3548]">
                      <div>
                        <div className="text-xs font-bold text-white">Welcome Email</div>
                        <div className="text-[9px] text-slate-500 mt-0.5">Sent instantly on new signup.</div>
                      </div>
                      <div
                        className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${automationSettings.welcomeEmail ? 'bg-indigo-600' : 'bg-slate-700'}`}
                        onClick={() => onUpdateAutomationSettings({...automationSettings, welcomeEmail: !automationSettings.welcomeEmail})}
                      >
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${automationSettings.welcomeEmail ? 'left-5' : 'left-1'}`} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-[#202533] rounded-xl border border-[#2E3548]">
                      <div>
                        <div className="text-xs font-bold text-white">Payment Status Alerts</div>
                        <div className="text-[9px] text-slate-500 mt-0.5">Approval/Rejection notifications.</div>
                      </div>
                      <div
                        className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${automationSettings.paymentApprovalAlert ? 'bg-indigo-600' : 'bg-slate-700'}`}
                        onClick={() => onUpdateAutomationSettings({...automationSettings, paymentApprovalAlert: !automationSettings.paymentApprovalAlert})}
                      >
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${automationSettings.paymentApprovalAlert ? 'left-5' : 'left-1'}`} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-[#202533] rounded-xl border border-[#2E3548]">
                      <div>
                        <div className="text-xs font-bold text-white">Suspension Alerts</div>
                        <div className="text-[9px] text-slate-500 mt-0.5">Critical account status emails.</div>
                      </div>
                      <div
                        className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${automationSettings.merchantSuspensionAlert ? 'bg-indigo-600' : 'bg-slate-700'}`}
                        onClick={() => onUpdateAutomationSettings({...automationSettings, merchantSuspensionAlert: !automationSettings.merchantSuspensionAlert})}
                      >
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${automationSettings.merchantSuspensionAlert ? 'left-5' : 'left-1'}`} />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-indigo-600/10 rounded-xl border border-indigo-500/20 flex gap-3">
                    <Info className="w-5 h-5 text-indigo-400 shrink-0" />
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Automated emails are sent using the platform's default SMTP provider. Ensure your sender details are updated in general settings.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* BROADCAST HISTORY - SPANNING FULL WIDTH */}
            <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
              <div className="p-5 bg-[#202533] border-b border-[#2E3548] flex items-center justify-between">
                <h4 className="text-xs font-bold text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-slate-400" />
                  Sent Broadcast History
                </h4>
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                  Total Sent: {broadcastHistory.length}
                </div>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#202533]/50 text-[10px] uppercase font-black text-slate-500 border-b border-[#2E3548]">
                      <th className="px-6 py-4">Date & Target</th>
                      <th className="px-6 py-4">Subject & Content</th>
                      <th className="px-6 py-4 text-right">Delivery Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2E3548]">
                    {broadcastHistory.map((bc) => (
                      <tr key={bc.id} className="hover:bg-[#202533]/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="text-[10px] text-white font-bold">{new Date(bc.timestamp).toLocaleDateString()}</div>
                          <div className="text-[9px] text-slate-500 uppercase font-black tracking-widest mt-1">{bc.audience}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs font-bold text-white">{bc.subject}</div>
                          <div className="text-[9px] text-slate-500 mt-1 line-clamp-1">{bc.type}</div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg border shadow-sm ${
                            bc.status === 'Delivered' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'
                          }`}>
                            {bc.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {broadcastHistory.length === 0 && (
                      <tr>
                        <td colSpan={3} className="p-16 text-center">
                          <div className="flex flex-col items-center gap-2">
                            <div className="bg-[#202533] p-3 rounded-2xl">
                              <History className="w-8 h-8 text-slate-600" />
                            </div>
                            <p className="text-slate-500 text-xs font-bold">No broadcast history available yet.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 11. SECURITY & LOGS TAB */}
        {activeSubTab === 'security' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">System Security & Audit Logs</h3>
                <p className="text-xs text-slate-400">Monitor system activity and manage platform security policies.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleExportLogs}
                  className="bg-[#202533] hover:bg-[#282E3F] text-slate-300 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition border border-[#3A435E] cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Export Logs (CSV)</span>
                </button>
                <button
                  onClick={handleClearLogs}
                  className="bg-red-500/10 hover:bg-red-600 text-red-500 hover:text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition border border-red-500/20 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Clear Logs</span>
                </button>
              </div>
            </div>

            {saveSuccess && (
              <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 p-4 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                <CheckCircle2 className="w-4 h-4" />
                {saveSuccess}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* AUDIT LOG TABLE */}
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl overflow-hidden flex flex-col h-[600px]">
                  <div className="p-4 bg-[#202533] border-b border-[#2E3548] flex flex-col sm:flex-row gap-4 justify-between items-center">
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 font-bold" />
                      <input
                        type="text"
                        value={logSearchQuery}
                        onChange={(e) => setLogSearchQuery(e.target.value)}
                        placeholder="Search logs..."
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl pl-10 pr-4 h-10 text-xs text-white focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-600"
                      />
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <span className="text-[10px] uppercase font-black text-slate-500 whitespace-nowrap">Filter Severity</span>
                      <select
                        value={logSeverityFilter}
                        onChange={(e) => setLogSeverityFilter(e.target.value as any)}
                        className="bg-[#181B26] border border-[#3A435E] rounded-xl px-4 h-10 text-[10px] font-black uppercase text-white outline-none focus:ring-1 focus:ring-indigo-500 appearance-none min-w-[130px] cursor-pointer"
                      >
                        <option value="All">All Levels</option>
                        <option value="Info">Info</option>
                        <option value="Warning">Warning</option>
                        <option value="Critical">Critical</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#202533]/50 text-[10px] uppercase font-black text-slate-500 border-b border-[#2E3548] sticky top-0 z-10">
                          <th className="px-4 py-3 font-black">Timestamp & User</th>
                          <th className="px-4 py-3 font-black">Action</th>
                          <th className="px-4 py-3 font-black">Entity & IP</th>
                          <th className="px-4 py-3 font-black">Severity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#2E3548]">
                        {filteredLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-[#202533]/30 transition-colors">
                            <td className="px-4 py-3">
                              <div className="text-[10px] text-white font-bold">{new Date(log.timestamp).toLocaleString()}</div>
                              <div className="text-[9px] text-slate-500 uppercase font-black tracking-widest mt-0.5">{log.adminUser}</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-xs font-bold text-white">{log.action}</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-[10px] text-slate-400 font-bold">{log.targetEntity}</div>
                              <div className="text-[9px] text-slate-600 mt-0.5">{log.ipAddress}</div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg border shadow-sm ${
                                log.severity === 'Critical' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                                log.severity === 'Warning' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                                'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                              }`}>
                                {log.severity}
                              </span>
                            </td>
                          </tr>
                        ))}

                        {filteredLogs.length === 0 && (
                          <tr>
                            <td colSpan={4} className="p-12 text-center">
                              <div className="w-12 h-12 bg-[#202533] rounded-full flex items-center justify-center mx-auto text-slate-600 mb-4">
                                <History className="w-6 h-6" />
                              </div>
                              <div className="text-slate-400 font-bold">No system logs found</div>
                              <div className="text-[10px] text-slate-500 uppercase mt-1">Try adjusting your filters or search query</div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* PAGINATION FOOTER FOR BALANCE */}
                  <div className="p-4 bg-[#202533] border-t border-[#2E3548] flex items-center justify-between">
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                      Showing {filteredLogs.length} of {auditLogs.length} Entries
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="w-8 h-8 rounded-lg bg-[#181B26] border border-[#3A435E] flex items-center justify-center text-slate-500 hover:text-white transition cursor-pointer">
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <div className="bg-indigo-600 text-white w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black">1</div>
                      <button className="w-8 h-8 rounded-lg bg-[#181B26] border border-[#3A435E] flex items-center justify-center text-slate-500 hover:text-white transition cursor-pointer">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECURITY SETTINGS PANEL */}
              <div className="space-y-6">
                <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl p-6 space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="bg-amber-500/20 p-2.5 rounded-xl">
                      <Lock className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Platform Security Policy</h4>
                      <p className="text-[10px] text-slate-500">Configure core security rules for all users.</p>
                    </div>
                  </div>

                  <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between p-3 bg-[#202533] rounded-xl border border-[#2E3548]">
                      <div>
                        <div className="text-xs font-bold text-white">Force 2FA for Merchants</div>
                        <div className="text-[9px] text-slate-500 mt-0.5">Require multi-factor auth for all sellers.</div>
                      </div>
                      <div
                        className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${securitySettings.force2FAForMerchants ? 'bg-indigo-600' : 'bg-slate-700'}`}
                        onClick={() => onUpdateSecuritySettings({...securitySettings, force2FAForMerchants: !securitySettings.force2FAForMerchants})}
                      >
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${securitySettings.force2FAForMerchants ? 'left-5' : 'left-1'}`} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-[#202533] rounded-xl border border-[#2E3548]">
                      <div>
                        <div className="text-xs font-bold text-white">IP Whitelisting</div>
                        <div className="text-[9px] text-slate-500 mt-0.5">Restrict admin access to known IPs.</div>
                      </div>
                      <div
                        className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${securitySettings.ipWhitelistingEnabled ? 'bg-indigo-600' : 'bg-slate-700'}`}
                        onClick={() => onUpdateSecuritySettings({...securitySettings, ipWhitelistingEnabled: !securitySettings.ipWhitelistingEnabled})}
                      >
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${securitySettings.ipWhitelistingEnabled ? 'left-5' : 'left-1'}`} />
                      </div>
                    </div>

                    <div className="space-y-1.5 p-3 bg-[#202533] rounded-xl border border-[#2E3548]">
                      <div className="flex justify-between items-center">
                        <div className="text-xs font-bold text-white">Admin Session Timeout</div>
                        <span className="text-[10px] font-black text-indigo-400">{securitySettings.adminSessionTimeout} Min</span>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="120"
                        step="5"
                        value={securitySettings.adminSessionTimeout}
                        onChange={(e) => onUpdateSecuritySettings({...securitySettings, adminSessionTimeout: parseInt(e.target.value)})}
                        className="w-full h-1.5 bg-[#181B26] rounded-full appearance-none cursor-pointer accent-indigo-600"
                      />
                    </div>

                    <div className="space-y-1.5 p-3 bg-[#202533] rounded-xl border border-[#2E3548]">
                      <div className="flex justify-between items-center">
                        <div className="text-xs font-bold text-white">Max Login Attempts</div>
                        <span className="text-[10px] font-black text-red-400">{securitySettings.maxLoginAttempts} Tries</span>
                      </div>
                      <input
                        type="range"
                        min="3"
                        max="10"
                        step="1"
                        value={securitySettings.maxLoginAttempts}
                        onChange={(e) => onUpdateSecuritySettings({...securitySettings, maxLoginAttempts: parseInt(e.target.value)})}
                        className="w-full h-1.5 bg-[#181B26] rounded-full appearance-none cursor-pointer accent-indigo-600"
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-amber-500/10 rounded-xl border border-amber-500/20 flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-amber-500">Security Recommendation</div>
                      <p className="text-[10px] text-amber-500/80 leading-relaxed mt-1">
                        We recommend enabling 2FA for all merchants to prevent account takeovers.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-2xl p-6 flex gap-4">
                  <div className="bg-indigo-600/20 p-3 rounded-xl shrink-0 h-fit">
                    <Info className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Advanced Security Logs</h4>
                    <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                      Detailed system events are stored for 90 days. Export logs regularly for your compliance records.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 8. THEME MANAGER TAB */}
        {activeSubTab === 'themes' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Theme & Template Manager</h3>
                <p className="text-xs text-slate-400">View, add, and edit store themes available for merchants.</p>
              </div>
              <button
                onClick={handleOpenAddTheme}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition shadow-lg shadow-indigo-600/20 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add New Theme</span>
              </button>
            </div>

            {saveSuccess && (
              <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 p-4 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                <CheckCircle2 className="w-4 h-4" />
                {saveSuccess}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {platformThemes.map((theme) => (
                <div key={theme.id} className="bg-[#181B26] border border-[#2E3548] rounded-2xl overflow-hidden group hover:border-indigo-500/50 transition-all duration-300 shadow-xl">
                  <div className="aspect-video w-full relative overflow-hidden bg-[#202533]">
                    <img
                      src={theme.thumbnailUrl || 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=400&q=80'}
                      alt={theme.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                      <button
                        onClick={() => handleOpenEditTheme(theme)}
                        className="bg-white/10 backdrop-blur-md hover:bg-white/20 text-white p-2 rounded-full transition border border-white/20"
                        title="Edit Theme"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTheme(theme.id)}
                        className="bg-red-500/20 backdrop-blur-md hover:bg-red-500 text-white p-2 rounded-full transition border border-red-500/40"
                        title="Delete Theme"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="absolute top-3 left-3 flex flex-col gap-2">
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border shadow-sm ${
                        theme.status === 'Active' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-500/20 text-slate-400 border-slate-500/30'
                      }`}>
                        {theme.status}
                      </span>
                      {theme.isFree ? (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-500 text-white border border-amber-500/30 shadow-lg shadow-amber-500/20">Free</span>
                      ) : (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-indigo-600 text-white border border-indigo-500/30 shadow-lg shadow-indigo-600/20">৳{theme.price} BDT</span>
                      )}
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-white text-sm truncate max-w-[150px]">{theme.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{theme.category}</p>
                        </div>
                      </div>
                      <a
                        href={theme.previewUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-400 hover:text-white transition"
                      >
                        <Eye className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                </div>
              ))}

              {platformThemes.length === 0 && (
                <div className="col-span-full py-20 text-center space-y-4">
                  <div className="w-16 h-16 bg-[#202533] rounded-full flex items-center justify-center mx-auto text-slate-600">
                    <Palette className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-slate-400 font-bold">No themes found</p>
                    <p className="text-xs text-slate-500">Start by adding your first store theme.</p>
                  </div>
                  <button
                    onClick={handleOpenAddTheme}
                    className="bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white px-6 py-2 rounded-xl text-xs font-bold transition border border-indigo-500/20"
                  >
                    Add First Theme
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 9. SUPPORT TICKETS TAB */}
        {activeSubTab === 'support' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Merchant Support Tickets</h3>
                <p className="text-xs text-slate-400">Manage and respond to merchant inquiries and technical issues.</p>
              </div>
              <div className="flex gap-3">
                <div className="bg-[#181B26] border border-[#2E3548] px-4 py-2 rounded-xl">
                  <div className="text-[10px] text-slate-500 uppercase font-black">Total Tickets</div>
                  <div className="text-sm font-bold text-white">{supportTickets.length}</div>
                </div>
                <div className="bg-[#181B26] border border-[#2E3548] px-4 py-2 rounded-xl">
                  <div className="text-[10px] text-slate-500 uppercase font-black text-amber-500">Open</div>
                  <div className="text-sm font-bold text-white">{supportTickets.filter(t => t.status === 'Open').length}</div>
                </div>
              </div>
            </div>

            {saveSuccess && (
              <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 p-4 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                <CheckCircle2 className="w-4 h-4" />
                {saveSuccess}
              </div>
            )}

            <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl overflow-hidden flex flex-col h-[600px]">
              <div className="p-4 bg-[#202533] border-b border-[#2E3548] flex flex-col sm:flex-row gap-4 justify-between items-center">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 font-bold" />
                  <input
                    type="text"
                    value={ticketSearchQuery}
                    onChange={(e) => setTicketSearchQuery(e.target.value)}
                    placeholder="Search tickets, stores..."
                    className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl pl-10 pr-4 h-10 text-xs text-white focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-600"
                  />
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <span className="text-[10px] uppercase font-black text-slate-500 whitespace-nowrap">Filter Status</span>
                  <select
                    value={ticketStatusFilter}
                    onChange={(e) => setTicketStatusFilter(e.target.value as any)}
                    className="bg-[#181B26] border border-[#3A435E] rounded-xl px-4 h-10 text-[10px] font-black uppercase text-white outline-none focus:ring-1 focus:ring-indigo-500 appearance-none min-w-[130px] cursor-pointer"
                  >
                    <option value="All">All Statuses</option>
                    <option value="Open">Open</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Resolved">Resolved</option>
                  </select>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#202533]/50 text-[10px] uppercase font-black text-slate-500 border-b border-[#2E3548] sticky top-0 z-10">
                      <th className="px-4 py-3 font-black">Ticket Info</th>
                      <th className="px-4 py-3 font-black">Merchant</th>
                      <th className="px-4 py-3 font-black">Priority</th>
                      <th className="px-4 py-3 font-black">Status</th>
                      <th className="px-4 py-3 text-right font-black">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2E3548]">
                    {filteredTickets.map((ticket) => (
                      <tr key={ticket.id} className="hover:bg-[#202533]/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="text-xs font-bold text-white">{ticket.subject}</div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-1">
                            <span className="bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded font-bold">{ticket.category}</span>
                            <span className="font-medium tracking-tight">#{ticket.id}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs font-bold text-white">{ticket?.storeName || 'Store'}</div>
                          <div className="text-[10px] text-slate-500">{ticket.merchantEmail}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg border shadow-sm ${
                            ticket.priority === 'High' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                            ticket.priority === 'Medium' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                            'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                          }`}>
                            {ticket.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg border shadow-sm ${
                            ticket.status === 'Resolved' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                            ticket.status === 'In Progress' ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' :
                            'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          }`}>
                            {ticket.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setSelectedTicketId(ticket.id)}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all shadow-lg shadow-indigo-600/20 cursor-pointer active:scale-95"
                          >
                            View & Reply
                          </button>
                          <button
                            onClick={async () => {
                               setIsGeneratingReply(true);
                               try {
                                 const response = await fetch('/api/ai/support-reply', {
                                   method: 'POST',
                                   headers: { 'Content-Type': 'application/json' },
                                   body: JSON.stringify({ ticketContent: ticket.subject + ' ' + ticket.category, customerName: ticket?.storeName || 'Merchant' })
                                 });
                                 const data = await response.json();
                                 setSupportDraft(data.draftReply);
                                 alert('AI Draft: \n\n' + data.draftReply);
                               } catch (e) {
                                 alert('Failed to generate draft.');
                               } finally {
                                 setIsGeneratingReply(false);
                               }
                            }}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 ml-2 rounded-xl text-[10px] font-black uppercase transition-all shadow-lg shadow-emerald-600/20 cursor-pointer active:scale-95"
                          >
                            {isGeneratingReply ? '...' : 'AI Draft'}
                          </button>
                        </td>
                      </tr>
                    ))}

                    {filteredTickets.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-20 text-center">
                          <div className="w-16 h-16 bg-[#202533] rounded-3xl flex items-center justify-center mx-auto text-slate-600 mb-4 shadow-inner">
                            <LifeBuoy className="w-8 h-8" />
                          </div>
                          <div className="text-white font-bold text-sm">No tickets found</div>
                          <p className="text-[10px] text-slate-500 uppercase mt-2 tracking-widest font-black">Try adjusting your filters or search query</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* PAGINATION FOOTER */}
              <div className="p-4 bg-[#202533] border-t border-[#2E3548] flex items-center justify-between">
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  Showing {filteredTickets.length} of {supportTickets.length} Tickets
                </div>
                <div className="flex items-center gap-2">
                  <button className="w-8 h-8 rounded-lg bg-[#181B26] border border-[#3A435E] flex items-center justify-center text-slate-500 hover:text-white transition cursor-pointer">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="bg-indigo-600 text-white w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black">1</div>
                  <button className="w-8 h-8 rounded-lg bg-[#181B26] border border-[#3A435E] flex items-center justify-center text-slate-500 hover:text-white transition cursor-pointer">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* TEAM MEMBER MODAL */}
      {isTeamModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#181B26] border border-[#2E3548] rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden scale-in-center">
            <div className="bg-[#202533] p-6 border-b border-[#2E3548] flex justify-between items-center">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-400" />
                Invite Team Member
              </h3>
              <button onClick={() => setIsTeamModalOpen(false)} className="text-slate-400 hover:text-white transition cursor-pointer">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSaveMember} className="p-6 space-y-5">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Full Name</label>
                  <input
                    type="text"
                    required
                    value={memberForm.fullName}
                    onChange={(e) => setMemberForm({...memberForm, fullName: e.target.value})}
                    placeholder="e.g. Sara Khan"
                    className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Email Address</label>
                  <input
                    type="email"
                    required
                    value={memberForm.email}
                    onChange={(e) => setMemberForm({...memberForm, email: e.target.value})}
                    placeholder="e.g. sara.khan@zid.com"
                    className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Assigned Role</label>
                  <select
                    value={memberForm.role}
                    onChange={(e) => setMemberForm({...memberForm, role: e.target.value as any})}
                    className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none"
                  >
                    <option value="Support Lead">Support Lead</option>
                    <option value="Finance Admin">Finance Admin</option>
                    <option value="Marketing Admin">Marketing Admin</option>
                    <option value="Super Admin">Super Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Initial Status</label>
                  <select
                    value={memberForm.status}
                    onChange={(e) => setMemberForm({...memberForm, status: e.target.value as any})}
                    className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsTeamModalOpen(false)}
                  className="flex-1 bg-[#202533] hover:bg-[#282E3F] text-slate-300 font-bold py-3.5 rounded-xl text-sm transition border border-[#3A435E] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl text-sm transition shadow-lg shadow-indigo-600/20 cursor-pointer"
                >
                  Invite Admin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD-ON EDITOR MODAL */}
      {isAddonModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#181B26] border border-[#2E3548] rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden scale-in-center">
            <div className="bg-[#202533] p-6 border-b border-[#2E3548] flex justify-between items-center">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Box className="w-5 h-5 text-indigo-400" />
                {editingAddonId ? 'Edit Add-on' : 'Create New Add-on'}
              </h3>
              <button onClick={() => setIsAddonModalOpen(false)} className="text-slate-400 hover:text-white transition cursor-pointer">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSaveAddon} className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Add-on Name</label>
                  <input
                    type="text"
                    required
                    value={addonForm.name}
                    onChange={(e) => setAddonForm({...addonForm, name: e.target.value})}
                    placeholder="e.g. Advanced Analytics"
                    className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Category</label>
                  <select
                    value={addonForm.category}
                    onChange={(e) => setAddonForm({...addonForm, category: e.target.value as any})}
                    className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none"
                  >
                    <option value="Marketing">Marketing</option>
                    <option value="Logistics">Logistics</option>
                    <option value="Communication">Communication</option>
                    <option value="Domain">Domain</option>
                    <option value="General">General</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Pricing Type</label>
                  <select
                    value={addonForm.pricingType}
                    onChange={(e) => setAddonForm({...addonForm, pricingType: e.target.value as any, price: e.target.value === 'Free' ? 0 : addonForm.price})}
                    className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none"
                  >
                    <option value="Free">Free</option>
                    <option value="One-time Fee">One-time Fee</option>
                    <option value="Monthly Recurring">Monthly Recurring</option>
                  </select>
                </div>
                {addonForm.pricingType !== 'Free' && (
                  <div>
                    <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Price (BDT)</label>
                    <input
                      type="number"
                      required
                      value={addonForm.price}
                      onChange={(e) => setAddonForm({...addonForm, price: parseInt(e.target.value) || 0})}
                      className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Icon Name</label>
                  <select
                    value={addonForm.icon}
                    onChange={(e) => setAddonForm({...addonForm, icon: e.target.value})}
                    className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none"
                  >
                    <option value="Box">Box (Default)</option>
                    <option value="Target">Target (Ads)</option>
                    <option value="Globe">Globe (Domain)</option>
                    <option value="MessageSquare">Message (SMS)</option>
                    <option value="Cpu">CPU (System)</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Description</label>
                  <textarea
                    required
                    value={addonForm.description}
                    onChange={(e) => setAddonForm({...addonForm, description: e.target.value})}
                    placeholder="Briefly describe what this add-on does..."
                    className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none min-h-[80px]"
                  />
                </div>
                <div className="col-span-2 flex items-center gap-3 py-2">
                  <div className={`w-12 h-7 rounded-full transition-colors relative cursor-pointer ${addonForm.isPublished ? 'bg-indigo-600' : 'bg-slate-700'}`}
                    onClick={() => setAddonForm({...addonForm, isPublished: !addonForm.isPublished})}
                  >
                    <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${addonForm.isPublished ? 'left-6' : 'left-1'}`} />
                  </div>
                  <span className="text-xs font-bold text-slate-300">Is Published & Available?</span>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddonModalOpen(false)}
                  className="flex-1 bg-[#202533] hover:bg-[#282E3F] text-slate-300 font-bold py-3.5 rounded-xl text-sm transition border border-[#3A435E] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl text-sm transition shadow-lg shadow-indigo-600/20 cursor-pointer"
                >
                  {editingAddonId ? 'Update Add-on' : 'Publish Add-on'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TICKET DETAIL MODAL */}
      {selectedTicketId && selectedTicket && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#181B26] border border-[#2E3548] rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden scale-in-center h-[80vh] flex flex-col">
            <div className="bg-[#202533] p-6 border-b border-[#2E3548] flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-500/20 p-2.5 rounded-xl">
                  <LifeBuoy className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{selectedTicket.subject}</h3>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    <span>{selectedTicket?.storeName || 'Store'}</span>
                    <span className="text-slate-600">•</span>
                    <span>{selectedTicket.category}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedTicketId(null)} className="text-slate-400 hover:text-white transition cursor-pointer">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#13161F]">
              {selectedTicket.messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender === 'admin' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl p-4 ${
                    msg.sender === 'admin'
                      ? 'bg-indigo-600 text-white rounded-tr-none'
                      : 'bg-[#202533] border border-[#2E3548] text-slate-200 rounded-tl-none'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                    <div className={`text-[9px] mt-2 font-bold uppercase tracking-widest ${msg.sender === 'admin' ? 'text-indigo-200' : 'text-slate-500'}`}>
                      {msg.sender === 'admin' ? 'Admin Support' : 'Merchant'} • {new Date(msg.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-6 bg-[#202533] border-t border-[#2E3548] shrink-0">
              <form onSubmit={handleSendReply} className="space-y-4">
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => handleUpdateTicketStatus(selectedTicket.id, 'In Progress')}
                    className={`text-[10px] font-black uppercase px-2 py-1 rounded border transition ${
                      selectedTicket.status === 'In Progress' ? 'bg-indigo-500 text-white border-indigo-400' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20'
                    }`}
                  >
                    Mark In Progress
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateTicketStatus(selectedTicket.id, 'Resolved')}
                    className={`text-[10px] font-black uppercase px-2 py-1 rounded border transition ${
                      selectedTicket.status === 'Resolved' ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                    }`}
                  >
                    Mark Resolved
                  </button>
                </div>
                <div className="relative">
                  <textarea
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Type your reply here..."
                    className="w-full bg-[#181B26] border border-[#3A435E] rounded-2xl px-5 py-4 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none min-h-[100px] resize-none"
                  />
                  <button
                    type="submit"
                    disabled={!replyMessage.trim()}
                    className="absolute bottom-4 right-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white p-2.5 rounded-xl transition shadow-lg shadow-indigo-600/20 cursor-pointer"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* THEME EDITOR MODAL */}
      {isThemeModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#181B26] border border-[#2E3548] rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden scale-in-center">
            <div className="bg-[#202533] p-6 border-b border-[#2E3548] flex justify-between items-center">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Palette className="w-5 h-5 text-indigo-400" />
                {editingThemeId ? 'Edit Theme' : 'Add New Theme'}
              </h3>
              <button onClick={() => setIsThemeModalOpen(false)} className="text-slate-400 hover:text-white transition cursor-pointer">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSaveTheme} className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Theme Name</label>
                  <input
                    type="text"
                    required
                    value={themeForm.name}
                    onChange={(e) => setThemeForm({...themeForm, name: e.target.value})}
                    placeholder="e.g. Minimalist Gold"
                    className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Category</label>
                  <select
                    value={themeForm.category}
                    onChange={(e) => setThemeForm({...themeForm, category: e.target.value})}
                    className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none"
                  >
                    <option value="General">General</option>
                    <option value="Fashion">Fashion</option>
                    <option value="Electronics">Electronics</option>
                    <option value="Groceries">Groceries</option>
                    <option value="Luxury">Luxury</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Status</label>
                  <select
                    value={themeForm.status}
                    onChange={(e) => setThemeForm({...themeForm, status: e.target.value as 'Active' | 'Hidden'})}
                    className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none"
                  >
                    <option value="Active">Active (Visible)</option>
                    <option value="Hidden">Hidden (Draft)</option>
                  </select>
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <div className={`w-12 h-7 rounded-full transition-colors relative cursor-pointer ${themeForm.isFree ? 'bg-amber-500' : 'bg-slate-700'}`}
                    onClick={() => setThemeForm({...themeForm, isFree: !themeForm.isFree, price: !themeForm.isFree ? 0 : themeForm.price})}
                  >
                    <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${themeForm.isFree ? 'left-6' : 'left-1'}`} />
                  </div>
                  <span className="text-xs font-bold text-slate-300">Is Free Theme?</span>
                </div>
                {!themeForm.isFree && (
                  <div>
                    <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Price (BDT)</label>
                    <input
                      type="number"
                      required
                      value={themeForm.price}
                      onChange={(e) => setThemeForm({...themeForm, price: parseInt(e.target.value) || 0})}
                      className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                    />
                  </div>
                )}
                <div className="col-span-2">
                  <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Thumbnail URL (400x300)</label>
                  <input
                    type="url"
                    required
                    value={themeForm.thumbnailUrl}
                    onChange={(e) => setThemeForm({...themeForm, thumbnailUrl: e.target.value})}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Live Preview URL</label>
                  <input
                    type="text"
                    value={themeForm.previewUrl}
                    onChange={(e) => setThemeForm({...themeForm, previewUrl: e.target.value})}
                    placeholder="#"
                    className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsThemeModalOpen(false)}
                  className="flex-1 bg-[#202533] hover:bg-[#282E3F] text-slate-300 font-bold py-3.5 rounded-xl text-sm transition border border-[#3A435E] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl text-sm transition shadow-lg shadow-indigo-600/20 cursor-pointer"
                >
                  {editingThemeId ? 'Save Changes' : 'Publish Theme'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE MERCHANT MODAL */}
      {isCreateMerchantModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#181B26] border border-[#2E3548] rounded-3xl w-full max-w-md shadow-2xl overflow-hidden scale-in-center">
            <div className="bg-[#202533] p-6 border-b border-[#2E3548] flex justify-between items-center">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-400" />
                Create New Merchant Store
              </h3>
              <button onClick={() => setIsCreateMerchantModalOpen(false)} className="text-slate-400 hover:text-white transition cursor-pointer">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleCreateMerchant} className="p-6 space-y-5">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Store Name</label>
                  <input
                    type="text"
                    required
                    value={newMerchantForm.storeName}
                    onChange={(e) => setNewMerchantForm({...newMerchantForm, storeName: e.target.value})}
                    placeholder="e.g. My Awesome Shop"
                    className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Owner Email Address</label>
                  <input
                    type="email"
                    required
                    value={newMerchantForm.email}
                    onChange={(e) => setNewMerchantForm({...newMerchantForm, email: e.target.value})}
                    placeholder="e.g. owner@example.com"
                    className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Initial Plan</label>
                    <select
                      value={newMerchantForm.plan}
                      onChange={(e) => setNewMerchantForm({...newMerchantForm, plan: e.target.value as SubscriptionPlanId})}
                      className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none appearance-none"
                    >
                      <option value="trial">Free Trial</option>
                      <option value="3_months">Starter (3M)</option>
                      <option value="6_months">Pro (6M)</option>
                      <option value="12_months">Enterprise (12M)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Expiry Days</label>
                    <input
                      type="number"
                      required
                      value={newMerchantForm.expiryDays}
                      onChange={(e) => setNewMerchantForm({...newMerchantForm, expiryDays: parseInt(e.target.value) || 0})}
                      className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateMerchantModalOpen(false)}
                  className="flex-1 bg-[#202533] hover:bg-[#282E3F] text-slate-300 font-bold py-3 rounded-xl text-sm transition border border-[#3A435E] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-sm transition shadow-lg shadow-indigo-600/30 cursor-pointer"
                >
                  Create Store
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK VERIFICATION MODAL */}
      {isApprovalDetailsModalOpen && selectedApprovalRequest && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#181B26] border border-[#2E3548] rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden scale-in-center">
            <div className="bg-[#202533] p-6 border-b border-[#2E3548] flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-6 h-6 text-emerald-400" />
                  Payment Verification
                </h3>
                <p className="text-[10px] text-slate-500 uppercase font-black mt-1">Manual Transaction Review</p>
              </div>
              <button onClick={() => setIsApprovalDetailsModalOpen(false)} className="text-slate-400 hover:text-white transition cursor-pointer p-2 hover:bg-[#3A435E] rounded-xl">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] uppercase font-black text-slate-500 block mb-1">Merchant Store</label>
                    <div className="text-white font-bold text-sm">{selectedApprovalRequest?.storeName || 'Store'}</div>
                    <div className="text-xs text-slate-400">{selectedApprovalRequest.email}</div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-black text-slate-500 block mb-1">Request Type</label>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                      selectedApprovalRequest.type === 'subscription' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}>
                      {selectedApprovalRequest.type} request
                    </span>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] uppercase font-black text-slate-500 block mb-1">Amount to Verify</label>
                    <div className="text-2xl font-black text-[#D4AF37]">৳{selectedApprovalRequest.amountBDT.toLocaleString()}</div>
                    <div className="text-[10px] text-slate-500 uppercase font-black">Bangladesh Taka</div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-black text-slate-500 block mb-1">Payment via</label>
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${
                        selectedApprovalRequest.paymentMethod.toLowerCase().includes('bkash') ? 'bg-pink-500' :
                        selectedApprovalRequest.paymentMethod.toLowerCase().includes('nagad') ? 'bg-orange-500' : 'bg-indigo-500'
                      }`} />
                      <span className="text-white font-bold text-xs capitalize">{selectedApprovalRequest.paymentMethod.replace('_admin', '')}</span>
                    </div>
                  </div>
                </div>
              </div>

              {selectedApprovalRequest.type === 'subscription' && (
                <div className="bg-[#12151F] border border-[#2E3548] rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-bold">Purchased Plan:</span>
                    <span className="text-amber-400 font-black">{getPlanDisplayName(selectedApprovalRequest.planId)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-bold">Validity from Today:</span>
                    <span className="text-emerald-400 font-black">
                      {getPlanDurationInDays(selectedApprovalRequest.planId)} Days (Valid until {calculateSubscriptionExpiry(selectedApprovalRequest.planId, new Date()).expiryDate})
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400/90 pt-1 border-t border-[#2E3548] leading-relaxed">
                    💡 <strong className="text-slate-300">Policy:</strong> Upon approval, validity starts strictly today for {getPlanDurationInDays(selectedApprovalRequest.planId)} days. Remaining free trial days are cleared and not added.
                  </div>
                </div>
              )}

              <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-5 shadow-inner">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-[10px] uppercase font-black text-slate-500">Submitted Transaction ID</div>
                  <button
                    onClick={() => handleCopyToClipboard(selectedApprovalRequest.transactionId)}
                    className="flex items-center gap-1.5 text-indigo-400 hover:text-white transition-colors text-[10px] font-black uppercase cursor-pointer"
                  >
                    {copySuccess === selectedApprovalRequest.transactionId ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy ID</>}
                  </button>
                </div>
                <div className="text-3xl font-mono text-center py-4 text-pink-400 font-black tracking-widest bg-[#181B26] rounded-xl border border-[#3A435E] shadow-2xl">
                  {selectedApprovalRequest.transactionId}
                </div>
                <p className="text-[10px] text-slate-500 text-center mt-3 leading-relaxed">
                  Please verify this TrxID in your {selectedApprovalRequest.paymentMethod.replace('_admin', '')} merchant panel before approving.
                </p>
              </div>

              {selectedApprovalRequest.status === 'pending' || selectedApprovalRequest.status === 'pending_approval' ? (
                <div className="grid grid-cols-2 gap-4 pt-4">
                  <button
                    onClick={() => {
                      if (selectedApprovalRequest.type === 'subscription') {
                        handleRejectRequest(selectedApprovalRequest.id);
                      } else {
                        handleRejectThemePurchase(selectedApprovalRequest.id);
                      }
                      setIsApprovalDetailsModalOpen(false);
                    }}
                    className="bg-red-500/10 hover:bg-red-500/20 text-red-400 font-black py-4 rounded-2xl text-[10px] uppercase tracking-widest transition-all border border-red-500/20 cursor-pointer"
                  >
                    Reject Request
                  </button>
                  <button
                    onClick={() => {
                      if (selectedApprovalRequest.type === 'subscription') {
                        handleApproveRequest(selectedApprovalRequest.id);
                      } else {
                        handleApproveThemePurchase(selectedApprovalRequest.id);
                      }
                      setIsApprovalDetailsModalOpen(false);
                    }}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl text-[10px] uppercase tracking-widest transition-all shadow-xl shadow-indigo-600/20 cursor-pointer active:scale-95"
                  >
                    Approve & Activate
                  </button>
                </div>
              ) : (
                <div className="bg-[#202533] border border-[#2E3548] p-4 rounded-xl text-center text-slate-400 text-xs italic">
                  This request has already been processed and is {selectedApprovalRequest.status}.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ADD CUSTOM GATEWAY MODAL */}
      {isCustomGatewayModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#181B26] border border-[#2E3548] rounded-3xl w-full max-w-md shadow-2xl overflow-hidden scale-in-center">
            <div className="bg-[#202533] p-6 border-b border-[#2E3548] flex justify-between items-center">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-400" />
                Add Custom Gateway
              </h3>
              <button onClick={() => setIsCustomGatewayModalOpen(false)} className="text-slate-400 hover:text-white transition cursor-pointer">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Gateway Name</label>
                <input
                  type="text"
                  required
                  value={newCustomGateway.name}
                  onChange={(e) => setNewCustomGateway({...newCustomGateway, name: e.target.value})}
                  placeholder="e.g. Upay or Rocket Personal"
                  className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Account Details / Instructions</label>
                <textarea
                  required
                  value={newCustomGateway.details}
                  onChange={(e) => setNewCustomGateway({...newCustomGateway, details: e.target.value})}
                  placeholder="Enter account number and payment instructions..."
                  className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none min-h-[100px] resize-none"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">Logo URL (Optional)</label>
                <input
                  type="url"
                  value={newCustomGateway.logoUrl}
                  onChange={(e) => setNewCustomGateway({...newCustomGateway, logoUrl: e.target.value})}
                  placeholder="https://..."
                  className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-black text-slate-500 mb-1.5">QR Code Image URL (Optional)</label>
                <input
                  type="url"
                  value={newCustomGateway.qrCodeUrl}
                  onChange={(e) => setNewCustomGateway({...newCustomGateway, qrCodeUrl: e.target.value})}
                  placeholder="https://..."
                  className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCustomGatewayModalOpen(false)}
                  className="flex-1 bg-[#202533] hover:bg-[#282E3F] text-slate-300 font-bold py-3 rounded-xl text-sm transition border border-[#3A435E] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddCustomGateway}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-sm transition shadow-lg shadow-indigo-600/30 cursor-pointer"
                >
                  Add Gateway
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
