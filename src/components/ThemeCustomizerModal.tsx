import React, { useState, useRef, useEffect } from 'react';
import { GalleryImage, MerchantProfile } from '../types';
import { TenantStorefrontView } from './TenantStorefrontView';
import { writeZidStoreData } from '../lib/storeData';
import { supabase } from '../lib/supabase';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Monitor,
  Smartphone,
  Tablet,
  History,
  Sparkles,
  Globe,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  GripVertical,
  RotateCcw,
  Sliders,
  Layers,
  Layout,
  ShoppingBag,
  Search,
  Menu as MenuIcon,
  X,
  CheckCircle2,
  Image as ImageIcon,
  Maximize2,
  ExternalLink,
  ChevronUp,
  Save,
  Palette,
  Edit3,
  Clock,
  Video,
  Grid,
  Share2,
  FileText,
  Phone,
  MapPin,
  Mail,
  Link,
  Play,
  Type,
  Maximize,
  Upload,
  Calendar,
  Film,
  Building2,
  Megaphone,
  Star,
  ShieldCheck,
  Lock,
  Facebook,
  Instagram,
  Youtube,
  Music,
  MessageCircle,
  MoreHorizontal,
} from 'lucide-react';

interface ThemeCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  themeName?: string;
  themeVersion?: string;
  merchant?: MerchantProfile;
  onPublish?: (merchant: MerchantProfile) => void;
  isPremiumPlan: boolean;
  onOpenSubscriptionModal: () => void;
}

export const ThemeCustomizerModal: React.FC<ThemeCustomizerModalProps> = ({
  isOpen,
  onClose,
  themeName = 'Growth',
  themeVersion = '1.0.0',
  merchant,
  onPublish,
  isPremiumPlan,
  onOpenSubscriptionModal
}) => {
  // Device Preview View Mode: 'desktop' | 'mobile' | 'tablet'
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'mobile' | 'tablet'>('mobile');

  const PremiumLockedWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    if (isPremiumPlan) return <>{children}</>;
    return (
      <div className="relative group">
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#181B26]/80 backdrop-blur-sm rounded-xl">
          <Lock className="w-6 h-6 text-amber-400 mb-2" />
          <span className="text-xs font-bold text-white">Premium Feature</span>
        </div>
        <div className="opacity-40 pointer-events-none blur-[1px]">
          {children}
        </div>
        <div
          className="absolute inset-0 z-20 cursor-pointer"
          onClick={onOpenSubscriptionModal}
          title="Upgrade to unlock this color and special features!"
        />
      </div>
    );
  };

  // Page View Selection
  const [selectedPage, setSelectedPage] = useState('Home page');
  const [showPageDropdown, setShowPageDropdown] = useState(false);

  // Language Selection
  const [selectedLang, setSelectedLang] = useState('English (EN)');
  const [showLangDropdown, setShowLangDropdown] = useState(false);

  // History State
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<string[]>(['Initial theme state loaded']);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Main Section Collapsible State
  const [expandedMainSection, setExpandedMainSection] = useState<'header' | 'content' | 'footer' | null>(null);

  // Drill-Down Isolated Section Editing State
  const [drillDownSection, setDrillDownSection] = useState<string | null>(null);
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);


  // Active Sub-item Editor State
  const [activeHeaderSub, setActiveHeaderSub] = useState<'settings' | 'logo' | 'announcement' | null>(null);
  const [activeContentSub, setActiveContentSub] = useState<'carousel' | 'categories' | 'products' | 'countdown' | 'gallery' | 'brand_social' | 'video' | null>(null);
  const [activeFooterSub, setActiveFooterSub] = useState<'logo' | 'link_groups' | 'about_us' | 'contact_info' | null>(null);

  // Modal for "+ Add Section"
  const [showAddSectionModal, setShowAddSectionModal] = useState(false);
  const [sectionSearchQuery, setSectionSearchQuery] = useState('');

  // Success Toast & Custom Toast Message
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Confirmation Modals
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [showExitConfirmModal, setShowExitConfirmModal] = useState(false);
  const [showPublishConfirmModal, setShowPublishConfirmModal] = useState(false);

  // ---------------- HEADER SECTION STATES ----------------
  const [headerSticky, setHeaderSticky] = useState(merchant?.themeConfig?.headerSticky ?? true);
  const [headerBgColor, setHeaderBgColor] = useState(merchant?.themeConfig?.headerBgColor ?? '#ffffff');
  const [hideLanguage, setHideLanguage] = useState(merchant?.themeConfig?.hideLanguage ?? false);
  const [hideCountry, setHideCountry] = useState(merchant?.themeConfig?.hideCountry ?? false);
  const [showSearchBar, setShowSearchBar] = useState(merchant?.themeConfig?.showSearchBar ?? true);

  const [storeLogoText, setStoreLogoText] = useState(merchant?.storeName || 'My Store');
  const [logoImageUrl, setLogoImageUrl] = useState(merchant?.themeConfig?.logoImageUrl ?? '');
  const [desktopLogoUrl, setDesktopLogoUrl] = useState(merchant?.themeConfig?.desktopLogoUrl ?? '');
  const [mobileLogoUrl, setMobileLogoUrl] = useState(merchant?.themeConfig?.mobileLogoUrl ?? '');
  const [logoHeight, setLogoHeight] = useState(merchant?.themeConfig?.logoHeight ?? 28);

  const [showAnnouncement, setShowAnnouncement] = useState(merchant?.themeConfig?.showAnnouncement ?? true);
  const [announcementText, setAnnouncementText] = useState(merchant?.announcementText || '');
  const [announcementBg, setAnnouncementBg] = useState(merchant?.themeConfig?.announcementBg ?? '#D4AF37');
  const [announcementLink, setAnnouncementLink] = useState(merchant?.themeConfig?.announcementLink ?? '/offers');
  const [isMarquee, setIsMarquee] = useState(merchant?.themeConfig?.isMarquee ?? true);
  const [marqueeSpeed, setMarqueeSpeed] = useState(merchant?.themeConfig?.marqueeSpeed ?? 20);
  const [announcementItems, setAnnouncementItems] = useState<string[]>(
    merchant?.themeConfig?.announcementItems && merchant?.themeConfig?.announcementItems?.length > 0
      ? merchant?.themeConfig?.announcementItems
      : (merchant?.announcementText ? [merchant?.announcementText] : [])
  );
  const [newAnnouncementInput, setNewAnnouncementInput] = useState('');

  // ---------------- PAGE CONTENT SECTION STATES ----------------
  // 1. Image Carousel (Hero)
  const [showHeroBanner, setShowHeroBanner] = useState(merchant?.themeConfig?.showHeroBanner ?? true);
  const [carouselTransition, setCarouselTransition] = useState(merchant?.themeConfig?.carouselTransition ?? 'slide');
  const [desktopCarouselHeight, setDesktopCarouselHeight] = useState(merchant?.themeConfig?.desktopCarouselHeight ?? 450);
  const [mobileCarouselHeight, setMobileCarouselHeight] = useState(merchant?.themeConfig?.mobileCarouselHeight ?? 320);
  const [activeSlideIndex, setActiveSlideIndex] = useState(merchant?.themeConfig?.activeSlideIndex ?? 0);
  const [slides, setSlides] = useState<Array<{id: string; title: string; subtitle: string; ctaText: string; ctaLink: string; image: string;}>>(
    merchant?.themeConfig?.slides && merchant?.themeConfig?.slides?.length > 0
      ? merchant?.themeConfig?.slides
      : [
          {
            id: 'slide-1',
            title: merchant?.heroTitle || 'Eid Ul Adha Special Collection 2026',
            subtitle: merchant?.heroSubtitle || 'Shop our premium organic food, traditional boutique, and authentic gadgets.',
            ctaText: merchant?.themeConfig?.heroCtaText || 'Shop Now',
            ctaLink: '#',
            image: merchant?.heroImage || 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1600&q=80'
          }
        ]
  );
  const [heroTitle, setHeroTitle] = useState(merchant?.heroTitle || (merchant?.themeConfig?.slides?.[0]?.title ?? 'Eid Ul Adha Special Collection 2026'));
  const [heroSubtitle, setHeroSubtitle] = useState(merchant?.heroSubtitle || (merchant?.themeConfig?.slides?.[0]?.subtitle ?? 'Shop our premium organic food, traditional boutique, and authentic gadgets.'));
  const [heroCtaText, setHeroCtaText] = useState(merchant?.themeConfig?.heroCtaText ?? (merchant?.themeConfig?.slides?.[0]?.ctaText ?? 'Shop Now'));
  const [heroImage, setHeroImage] = useState(merchant?.heroImage || (merchant?.themeConfig?.slides?.[0]?.image ?? 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1600&q=80'));

  // 2. Categories
  const [showCategories, setShowCategories] = useState(merchant?.themeConfig?.showCategories ?? true);
  const [categoriesHeading, setCategoriesHeading] = useState(merchant?.themeConfig?.categoriesHeading ?? 'Popular Categories');
  const [categoriesSubtitle, setCategoriesSubtitle] = useState(merchant?.themeConfig?.categoriesSubtitle ?? 'Shop by category');
  const [categoriesLayout, setCategoriesLayout] = useState(merchant?.themeConfig?.categoriesLayout ?? 'Grid');
  const [categoriesSelection, setCategoriesSelection] = useState(merchant?.themeConfig?.categoriesSelection ?? 'All categories');
  const [categoriesItemsPerRow, setCategoriesItemsPerRow] = useState(merchant?.themeConfig?.categoriesItemsPerRow ?? 4);
  const [categoriesShowItemCount, setCategoriesShowItemCount] = useState(merchant?.themeConfig?.categoriesShowItemCount ?? true);
  const [categoriesShowMoreButton, setCategoriesShowMoreButton] = useState(merchant?.themeConfig?.categoriesShowMoreButton ?? true);
  const [categoriesMoreButtonText, setCategoriesMoreButtonText] = useState(merchant?.themeConfig?.categoriesMoreButtonText ?? 'View All');
  const [categoriesBgImage, setCategoriesBgImage] = useState(merchant?.themeConfig?.categoriesBgImage ?? '');
  const [categoriesOverlayOpacity, setCategoriesOverlayOpacity] = useState(merchant?.themeConfig?.categoriesOverlayOpacity ?? 40);
  const [categoriesList, setCategoriesList] = useState<Array<{name: string; image: string; count: string;}>>(
    merchant?.themeConfig?.categoriesList ?? []
  );

  // 3. Products
  const [showFeaturedGrid, setShowFeaturedGrid] = useState(merchant?.themeConfig?.showFeaturedGrid ?? true);
  const [featuredHeading, setFeaturedHeading] = useState(merchant?.themeConfig?.featuredHeading ?? 'Featured Products');
  const [productColumns, setProductColumns] = useState(merchant?.themeConfig?.productColumns ?? 4);
  const [productsLayout, setProductsLayout] = useState(merchant?.themeConfig?.productsLayout ?? 'Grid');
  const [productsSelection, setProductsSelection] = useState(merchant?.themeConfig?.productsSelection ?? 'On sale products');
  const [productsShowMoreButton, setProductsShowMoreButton] = useState(merchant?.themeConfig?.productsShowMoreButton ?? true);
  const [productsMoreButtonText, setProductsMoreButtonText] = useState(merchant?.themeConfig?.productsMoreButtonText ?? 'View More');

  // 4. Countdown Timer
  const [showCountdown, setShowCountdown] = useState(merchant?.themeConfig?.showCountdown ?? true);
  const [countdownTitle, setCountdownTitle] = useState(merchant?.themeConfig?.countdownTitle ?? '⚡ Flash Sale Ends In:');
  const [countdownEndDate, setCountdownEndDate] = useState(merchant?.themeConfig?.countdownEndDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16));
  const [countdownBgImage, setCountdownBgImage] = useState(merchant?.themeConfig?.countdownBgImage ?? '');
  const [countdownOverlayOpacity, setCountdownOverlayOpacity] = useState(merchant?.themeConfig?.countdownOverlayOpacity ?? 60);
  const [countdownHours, setCountdownHours] = useState(merchant?.themeConfig?.countdownHours ?? 14);
  const [countdownDiscount, setCountdownDiscount] = useState(merchant?.themeConfig?.countdownDiscount ?? 'Extra 15% OFF!');

  // 5. Gallery
  const [showGallery, setShowGallery] = useState(merchant?.themeConfig?.showGallery ?? true);
  const [galleryHeading, setGalleryHeading] = useState(merchant?.themeConfig?.galleryHeading ?? 'Gallery');
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>(
    merchant?.themeConfig?.galleryImages && merchant?.themeConfig?.galleryImages?.length > 0
      ? merchant?.themeConfig?.galleryImages
      : [
          { url: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=300&q=80', caption: 'Artisan Craftsmanship 1', link: '#' },
          { url: 'https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?auto=format&fit=crop&w=300&q=80', caption: 'Artisan Craftsmanship 2', link: '#' },
          { url: 'https://images.unsplash.com/photo-1590736969955-71cb94801759?auto=format&fit=crop&w=300&q=80', caption: 'Artisan Craftsmanship 3', link: '#' },
          { url: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=300&q=80', caption: 'Artisan Craftsmanship 4', link: '#' }
        ]
  );

  // 6. Logo & Social Media
  const [showSocialBlock, setShowSocialBlock] = useState(merchant?.themeConfig?.showSocialBlock ?? true);
  const [socialTagline, setSocialTagline] = useState(merchant?.themeConfig?.socialTagline ?? '');
  const [facebookHandle, setFacebookHandle] = useState(merchant?.themeConfig?.facebookHandle ?? '');
  const [instagramHandle, setInstagramHandle] = useState(merchant?.themeConfig?.instagramHandle ?? '');
  const [whatsappNumber, setWhatsappNumber] = useState(merchant?.themeConfig?.whatsappNumber ?? '');
  const [tiktokHandle, setTiktokHandle] = useState(merchant?.themeConfig?.tiktokHandle ?? '');
  const [youtubeHandle, setYoutubeHandle] = useState(merchant?.themeConfig?.youtubeHandle ?? '');
  const [showFacebook, setShowFacebook] = useState(merchant?.themeConfig?.showFacebook ?? true);
  const [showInstagram, setShowInstagram] = useState(merchant?.themeConfig?.showInstagram ?? true);
  const [showWhatsapp, setShowWhatsapp] = useState(merchant?.themeConfig?.showWhatsapp ?? true);
  const [showTikTok, setShowTikTok] = useState(merchant?.themeConfig?.showTikTok ?? true);
  const [showYouTube, setShowYouTube] = useState(merchant?.themeConfig?.showYouTube ?? true);
  const [socialButtonStyle, setSocialButtonStyle] = useState(merchant?.themeConfig?.socialButtonStyle ?? 'Modern Pill Buttons');

  // 7. Video
  const [showVideo, setShowVideo] = useState(merchant?.themeConfig?.showVideo ?? true);
  const [videoTitle, setVideoTitle] = useState(merchant?.themeConfig?.videoTitle ?? '');
  const [videoUrl, setVideoUrl] = useState(merchant?.themeConfig?.videoUrl ?? 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const [videoCoverImage, setVideoCoverImage] = useState(merchant?.themeConfig?.videoCoverImage ?? '');
  const [videoFileUrl, setVideoFileUrl] = useState(merchant?.themeConfig?.videoFileUrl ?? '');
  const [videoAutoplay, setVideoAutoplay] = useState(merchant?.themeConfig?.videoAutoplay ?? false);
  const [videoMuted, setVideoMuted] = useState(merchant?.themeConfig?.videoMuted ?? true);

  // File Upload Refs
  const galleryAddInputRef = useRef<HTMLInputElement>(null);
  const galleryUpdateInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [updatingGalleryIndex, setUpdatingGalleryIndex] = useState<number | null>(null);

  const handleGalleryImageUpload = (e: React.ChangeEvent<HTMLInputElement>, mode: 'add' | 'update', index?: number) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        if (mode === 'add') {
          setGalleryImages([...galleryImages, { url: base64String, caption: 'New Image', link: '#' }]);
        } else if (mode === 'update' && index !== undefined) {
          const newImages = [...galleryImages];
          newImages[index].url = base64String;
          setGalleryImages(newImages);
        }
        // Reset input value
        e.target.value = '';
      };
      reader.readAsDataURL(file);
    }
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const vUrl = URL.createObjectURL(file);
      setVideoFileUrl(vUrl);
      // Reset input value
      e.target.value = '';
    }
  };

  // Dynamic added sections
  const [addedSections, setAddedSections] = useState<Array<{ id: string; name: string }>>([]);

  // ---------------- SYNC HELPERS ----------------
  // Keep announcement text, header settings and hero fields in sync with the
  // live preview and mark unsaved changes on every editor interaction.
  const markDirty = () => setHasUnsavedChanges(true);

  const updateAnnouncementText = (text: string) => {
    setAnnouncementText(text);
    // The storefront renders announcementItems (or falls back to announcementText),
    // so keep the first item mirrored to the main text field.
    setAnnouncementItems(prev => {
      if (prev.length === 0) return text.trim() ? [text] : [];
      const updated = [...prev];
      updated[0] = text;
      return updated;
    });
    // Keep the active slide-independent merchant announcement synced in shared store too.
    markDirty();
  };

  const updateAnnouncementItems = (itemsOrUpdater: string[] | ((prev: string[]) => string[])) => {
    setAnnouncementItems(prev => {
      const next = typeof itemsOrUpdater === 'function' ? itemsOrUpdater(prev) : itemsOrUpdater;
      setAnnouncementText(next[0] ?? '');
      return next;
    });
    markDirty();
  };

  const updateHeaderSticky = (val: boolean) => { setHeaderSticky(val); markDirty(); };
  const updateShowSearchBar = (val: boolean) => { setShowSearchBar(val); markDirty(); };
  const updateShowAnnouncement = (val: boolean) => { setShowAnnouncement(val); markDirty(); };
  const updateAnnouncementBg = (val: string) => { setAnnouncementBg(val); markDirty(); };
  const updateHeaderBgColor = (val: string) => { setHeaderBgColor(val); markDirty(); };
  const updateHideLanguage = (val: boolean) => { setHideLanguage(val); markDirty(); };
  const updateHideCountry = (val: boolean) => { setHideCountry(val); markDirty(); };

  const updateHeroTitle = (val: string) => { setHeroTitle(val); markDirty(); };
  const updateHeroSubtitle = (val: string) => { setHeroSubtitle(val); markDirty(); };
  const updateHeroImage = (val: string) => { setHeroImage(val); markDirty(); };

  // ---------------- DRAG AND DROP REORDER STATES & HANDLERS ----------------
  // Top Level Main Sections Order
  const [mainSectionsOrder, setMainSectionsOrder] = useState<Array<{ id: 'header' | 'content' | 'footer'; name: string; number: string }>>([
    { id: 'header', name: 'Header', number: '1.' },
    { id: 'content', name: 'Page Content', number: '2.' },
    { id: 'footer', name: 'Footer', number: '3.' }
  ]);

  // Header Sub-items Order
  const [headerSectionsOrder, setHeaderSectionsOrder] = useState<Array<{ id: 'settings' | 'logo' | 'announcement'; name: string }>>([
    { id: 'settings', name: 'Header Settings' },
    { id: 'logo', name: 'Logo' },
    { id: 'announcement', name: 'Announcement Bar' }
  ]);

  // Page Content Sections Order
  const [contentSectionsOrder, setContentSectionsOrder] = useState<Array<{ id: string; key: string; name: string; isCustom?: boolean }>>(
    merchant?.themeConfig?.contentSectionsOrder ?? [
      { id: 'carousel', key: 'carousel', name: 'Image Carousel' },
      { id: 'categories', key: 'categories', name: 'Categories' },
      { id: 'products', key: 'products', name: 'Products' },
      { id: 'countdown', key: 'countdown', name: 'Countdown Timer' },
      { id: 'gallery', key: 'gallery', name: 'Gallery' },
      { id: 'brand_social', key: 'brand_social', name: 'Logo & Social Media' },
      { id: 'video', key: 'video', name: 'Video' }
    ]
  );

  // Footer Sub-items Order
  const [footerSectionsOrder, setFooterSectionsOrder] = useState<Array<{ id: 'logo' | 'link_groups' | 'about_us' | 'contact_info'; name: string }>>([
    { id: 'logo', name: 'Logo' },
    { id: 'link_groups', name: 'Link Groups' },
    { id: 'about_us', name: 'About Us' },
    { id: 'contact_info', name: 'Contact Information' }
  ]);

  // Drag state
  const [dragGroup, setDragGroup] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Touch Drag Support for Mobile Devices
  const touchStateRef = useRef<{ group: string; index: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent, group: string, index: number) => {
    touchStateRef.current = { group, index };
    setDragGroup(group);
    setDraggedIndex(index);
    setDragOverIndex(index);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStateRef.current) return;
    const touch = e.touches[0];
    const elem = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!elem) return;

    const itemElem = elem.closest(`[data-drag-group="${touchStateRef.current.group}"]`);
    if (itemElem) {
      const idxAttr = itemElem.getAttribute('data-drag-index');
      if (idxAttr !== null) {
        const targetIndex = parseInt(idxAttr, 10);
        if (!isNaN(targetIndex) && targetIndex !== dragOverIndex) {
          setDragOverIndex(targetIndex);
        }
      }
    }
  };

  const moveArrayItem = <T,>(arr: T[], from: number, to: number): T[] => {
    if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return arr;
    const copy = [...arr];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    return copy;
  };

  const executeReorder = (group: string, sourceIndex: number, targetIndex: number) => {
    if (sourceIndex === targetIndex || sourceIndex < 0 || targetIndex < 0) return;

    if (group === 'mainSections') {
      setMainSectionsOrder(prev => moveArrayItem(prev, sourceIndex, targetIndex));
      setHistoryLogs(prev => [`Reordered main sections (Header/Content/Footer)`, ...prev]);
    } else if (group === 'contentSections') {
      setContentSectionsOrder(prev => moveArrayItem(prev, sourceIndex, targetIndex));
      setHistoryLogs(prev => [`Reordered Page Content layout items`, ...prev]);
    } else if (group === 'headerSections') {
      setHeaderSectionsOrder(prev => moveArrayItem(prev, sourceIndex, targetIndex));
      setHistoryLogs(prev => [`Reordered Header layout items`, ...prev]);
    } else if (group === 'footerSections') {
      setFooterSectionsOrder(prev => moveArrayItem(prev, sourceIndex, targetIndex));
      setHistoryLogs(prev => [`Reordered Footer layout items`, ...prev]);
    } else if (group === 'slides') {
      setSlides(prev => moveArrayItem(prev, sourceIndex, targetIndex));
      setHistoryLogs(prev => [`Reordered Carousel slides`, ...prev]);
    } else if (group === 'announcements') {
      setAnnouncementItems(prev => moveArrayItem(prev, sourceIndex, targetIndex));
      setHistoryLogs(prev => [`Reordered Announcement items`, ...prev]);
    } else if (group === 'addedSections') {
      setAddedSections(prev => moveArrayItem(prev, sourceIndex, targetIndex));
      setHistoryLogs(prev => [`Reordered Added Custom Sections`, ...prev]);
    }

    setHasUnsavedChanges(true);
  };

  const handleTouchEnd = () => {
    if (!touchStateRef.current) return;
    const { group, index: sourceIndex } = touchStateRef.current;
    const targetIndex = dragOverIndex;

    if (targetIndex !== null && sourceIndex !== targetIndex) {
      executeReorder(group, sourceIndex, targetIndex);
    }

    touchStateRef.current = null;
    setDragGroup(null);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragStart = (e: React.DragEvent, group: string, index: number) => {
    setDragGroup(group);
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ group, index }));
  };

  const handleDragOver = (e: React.DragEvent, group: string, index: number) => {
    e.preventDefault();
    if (dragGroup === group && dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, group: string, targetIndex: number) => {
    e.preventDefault();
    if (dragGroup === group && draggedIndex !== null) {
      executeReorder(group, draggedIndex, targetIndex);
    }
    setDragGroup(null);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    if (dragGroup && draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      executeReorder(dragGroup, draggedIndex, dragOverIndex);
    }
    setDragGroup(null);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const moveItemUp = (group: string, index: number) => {
    if (index <= 0) return;
    executeReorder(group, index, index - 1);
  };

  const moveItemDown = (group: string, index: number, maxLen: number) => {
    if (index >= maxLen - 1) return;
    executeReorder(group, index, index + 1);
  };

  const getSectionIndex = (id: string) => {
    const idx = contentSectionsOrder.findIndex(s => s.id === id);
    return idx >= 0 ? idx : 0;
  };

  const getHeaderSectionIndex = (id: string) => {
    const idx = headerSectionsOrder.findIndex(s => s.id === id);
    return idx >= 0 ? idx : 0;
  };

  const getFooterSectionIndex = (id: string) => {
    const idx = footerSectionsOrder.findIndex(s => s.id === id);
    return idx >= 0 ? idx : 0;
  };

  // ---------------- FOOTER SECTION STATES ----------------
  const [footerLogoText, setFooterLogoText] = useState(merchant?.themeConfig?.footerLogoText ?? 'My Store');
  const [footerTagline, setFooterTagline] = useState(merchant?.themeConfig?.footerTagline ?? '');

  const [footerLinksTitle, setFooterLinksTitle] = useState(merchant?.themeConfig?.footerLinksTitle ?? 'Quick Links');
  const [footerLinks, setFooterLinks] = useState(merchant?.themeConfig?.footerLinks ?? ['About Us', 'Shipping & Delivery', 'Return & Refund Policy', 'Track Order']);

  const [footerAboutText, setFooterAboutText] = useState(merchant?.themeConfig?.footerAboutText ?? '');
  const [dhakaAddress, setDhakaAddress] = useState(merchant?.themeConfig?.dhakaAddress ?? '');

  const [contactPhone, setContactPhone] = useState(merchant?.themeConfig?.contactPhone ?? '');
  const [contactEmail, setContactEmail] = useState(merchant?.themeConfig?.contactEmail ?? '');
  const [showPaymentBadges, setShowPaymentBadges] = useState(merchant?.themeConfig?.showPaymentBadges ?? true);

  // Mark the theme dirty whenever ANY section setting changes, so live-editing
  // every section input instantly flags unsaved changes (single source of truth).
  const isInitialThemeMount = useRef(true);
  useEffect(() => {
    if (isInitialThemeMount.current) { isInitialThemeMount.current = false; return; }
    setHasUnsavedChanges(true);
  }, [
    storeLogoText, logoImageUrl, desktopLogoUrl, mobileLogoUrl, logoHeight,
    headerSticky, headerBgColor, hideLanguage, hideCountry, showSearchBar,
    showAnnouncement, announcementText, announcementBg, announcementLink, isMarquee, marqueeSpeed, announcementItems,
    showHeroBanner, carouselTransition, desktopCarouselHeight, mobileCarouselHeight, activeSlideIndex, slides,
    heroTitle, heroSubtitle, heroCtaText, heroImage,
    showCategories, categoriesHeading, categoriesSubtitle, categoriesLayout, categoriesSelection, categoriesItemsPerRow,
    categoriesShowItemCount, categoriesShowMoreButton, categoriesMoreButtonText, categoriesBgImage, categoriesOverlayOpacity, categoriesList,
    showFeaturedGrid, featuredHeading, productColumns, productsLayout, productsSelection, productsShowMoreButton, productsMoreButtonText,
    showCountdown, countdownTitle, countdownEndDate, countdownBgImage, countdownOverlayOpacity, countdownHours, countdownDiscount,
    showGallery, galleryHeading, galleryImages,
    showSocialBlock, socialTagline, facebookHandle, instagramHandle, whatsappNumber, tiktokHandle, youtubeHandle,
    showFacebook, showInstagram, showWhatsapp, showTikTok, showYouTube, socialButtonStyle,
    showVideo, videoTitle, videoUrl, videoCoverImage, videoFileUrl, videoAutoplay, videoMuted,
    footerLogoText, footerTagline, footerLinksTitle, footerLinks, footerAboutText, dhakaAddress, contactPhone, contactEmail, showPaymentBadges,
    contentSectionsOrder, mainSectionsOrder, headerSectionsOrder, footerSectionsOrder
  ]);

  if (!isOpen) return null;

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setShowSuccessToast(true);
    setTimeout(() => {
      setShowSuccessToast(false);
      setToastMessage(null);
    }, 3500);
  };

  const handlePublish = () => {
    setShowPublishConfirmModal(true);
  };

  const performPublish = async () => {
    setShowPublishConfirmModal(false);
    setHasUnsavedChanges(false);
    setHistoryLogs((prev) => [`Published theme customization at ${new Date().toLocaleTimeString()}`, ...prev]);

    // Build the updated merchant profile + theme config (always, so persistence works)
    const themeConfig: Record<string, unknown> = {
      storeLogoText, logoImageUrl, desktopLogoUrl, mobileLogoUrl, logoHeight,
      headerSticky, headerBgColor, hideLanguage, hideCountry, showSearchBar,
      showAnnouncement, announcementText, announcementBg, announcementLink, isMarquee, marqueeSpeed, announcementItems,
      showHeroBanner, carouselTransition, desktopCarouselHeight, mobileCarouselHeight, activeSlideIndex, slides, heroTitle, heroSubtitle, heroCtaText, heroImage,
      showCategories, categoriesHeading, categoriesSubtitle, categoriesLayout, categoriesSelection, categoriesItemsPerRow, categoriesShowItemCount, categoriesMoreButtonText, categoriesShowMoreButton, categoriesBgImage, categoriesOverlayOpacity, categoriesList,
      showFeaturedGrid, featuredHeading, productColumns, productsLayout, productsSelection, productsShowMoreButton, productsMoreButtonText,
      showCountdown, countdownTitle, countdownEndDate, countdownBgImage, countdownOverlayOpacity, countdownHours, countdownDiscount,
      showGallery, galleryHeading, galleryImages,
      showSocialBlock, socialTagline, facebookHandle, instagramHandle, whatsappNumber, tiktokHandle, youtubeHandle, showFacebook, showInstagram, showWhatsapp, showTikTok, showYouTube, socialButtonStyle,
      showVideo, videoTitle, videoUrl, videoCoverImage, videoFileUrl, videoAutoplay, videoMuted,
      footerLogoText, footerTagline, footerLinksTitle, footerLinks, footerAboutText, dhakaAddress, contactPhone, contactEmail, showPaymentBadges,
      contentSectionsOrder, mainSectionsOrder, headerSectionsOrder, footerSectionsOrder
    };

    const updatedMerchant: MerchantProfile = merchant ? {
      ...merchant,
      storeName: storeLogoText,
      heroTitle,
      heroSubtitle,
      heroImage,
      announcementText,
      themeConfig,
    } : ({} as MerchantProfile);

    if (merchant && onPublish) {
      onPublish(updatedMerchant);
    }

    // Persist the published theme to the slug-scoped shared store so the live
    // storefront (and other tabs) pick it up instantly via storage/CustomEvent.
    try {
      const slug = (updatedMerchant.storeSlug || updatedMerchant.storeName || 'my-store')
        .toLowerCase().replace(/[^a-z0-9]/g, '');
      writeZidStoreData(
        { merchant: updatedMerchant, themeCustomization: themeConfig as Record<string, unknown> },
        slug
      );
    } catch (e) {
      console.warn('[ThemeCustomizer] Shared store write failed:', e);
    }

    // Persist to Supabase 'stores' table (theme_config + hero/announcement fields)
    // so the customer-facing storefront renders the saved theme after reload.
    try {
      if (supabase && merchant?.email) {
        const { error: themeSaveErr } = await supabase
          .from('stores')
          .upsert({
            email: updatedMerchant.email.trim().toLowerCase(),
            store_name: updatedMerchant.storeName,
            store_slug: (updatedMerchant.storeSlug || updatedMerchant.storeName || 'my-store')
              .toLowerCase().replace(/[^a-z0-9]/g, ''),
            theme_config: themeConfig,
            hero_title: heroTitle,
            hero_subtitle: heroSubtitle,
            hero_image: heroImage,
            announcement_text: announcementText,
            logo_url: logoImageUrl || desktopLogoUrl || mobileLogoUrl || '',
            active_theme_id: updatedMerchant.activeThemeId || null,
            updated_at: new Date().toISOString()
          }, { onConflict: 'email' });
        if (themeSaveErr) {
          console.warn('[ThemeCustomizer] Supabase theme save notice:', themeSaveErr.message);
        }

        // Also persist to the 'stores' table (used for tenant storefront lookups).
        const storeRow = {
          email: updatedMerchant.email.trim().toLowerCase(),
          store_name: updatedMerchant.storeName,
          store_slug: (updatedMerchant.storeSlug || updatedMerchant.storeName || 'my-store')
            .toLowerCase().replace(/[^a-z0-9]/g, ''),
          theme_config: themeConfig,
          hero_title: heroTitle,
          hero_subtitle: heroSubtitle,
          hero_image: heroImage,
          announcement_text: announcementText,
          logo_url: logoImageUrl || desktopLogoUrl || mobileLogoUrl || '',
          active_theme_id: updatedMerchant.activeThemeId || null,
          updated_at: new Date().toISOString()
        };
        const { error: storesSaveErr } = await supabase
          .from('stores')
          .upsert(storeRow, { onConflict: 'email' });
        if (storesSaveErr) {
          console.warn('[ThemeCustomizer] Supabase stores save notice:', storesSaveErr.message);
          // 'stores' may not exist or may not have an email unique constraint —
          // retry as an update targeted by slug, then by insert fallback.
          const { error: updErr } = await supabase
            .from('stores')
            .update(storeRow)
            .eq('store_slug', storeRow.store_slug);
          if (updErr) {
            const { error: insErr } = await supabase.from('stores').insert(storeRow);
            if (insErr) console.warn('[ThemeCustomizer] Supabase stores insert notice:', insErr.message);
          }
        }
      }
    } catch (e) {
      console.warn('[ThemeCustomizer] Supabase theme save exception:', e);
    }

    triggerToast('Theme changes published live to storefront successfully!');
  };

  const handleSaveDraft = () => {
    setHasUnsavedChanges(false);
    setHistoryLogs((prev) => [`Saved draft customization at ${new Date().toLocaleTimeString()}`, ...prev]);
    triggerToast('Theme draft saved successfully!');
  };

  const handleDiscardConfirm = () => {
    setAnnouncementText('🎉 Free Nationwide Shipping across Bangladesh on Orders Over ৳2,000!');
    setHeroTitle('Eid Ul Adha Special Collection 2026');
    setShowHeroBanner(true);
    setShowAnnouncement(true);
    setMainSectionsOrder([
      { id: 'header', name: 'Header', number: '1.' },
      { id: 'content', name: 'Page Content', number: '2.' },
      { id: 'footer', name: 'Footer', number: '3.' }
    ]);
    setContentSectionsOrder([
      { id: 'carousel', key: 'carousel', name: 'Image Carousel' },
      { id: 'categories', key: 'categories', name: 'Categories' },
      { id: 'products', key: 'products', name: 'Products' },
      { id: 'countdown', key: 'countdown', name: 'Countdown Timer' },
      { id: 'gallery', key: 'gallery', name: 'Gallery' },
      { id: 'brand_social', key: 'brand_social', name: 'Logo & Social Media' },
      { id: 'video', key: 'video', name: 'Video' }
    ]);
    setHeaderSectionsOrder([
      { id: 'settings', name: 'Header Settings' },
      { id: 'logo', name: 'Logo' },
      { id: 'announcement', name: 'Announcement Bar' }
    ]);
    setFooterSectionsOrder([
      { id: 'logo', name: 'Logo' },
      { id: 'link_groups', name: 'Link Groups' },
      { id: 'about_us', name: 'About Us' },
      { id: 'contact_info', name: 'Contact Information' }
    ]);
    setHasUnsavedChanges(false);
    setShowDiscardModal(false);
    triggerToast('All unsaved edits discarded. Reverted to published state.');
  };

  const handleBackOrClose = () => {
    if (hasUnsavedChanges) {
      setShowExitConfirmModal(true);
    } else {
      onClose();
    }
  };

  const getItemDragStyles = (group: string, index: number, defaultBorder = 'border-[#2E3548]') => {
    const isDragging = dragGroup === group && draggedIndex === index;
    const isDragOver = dragGroup === group && dragOverIndex === index && draggedIndex !== index;

    if (isDragging) {
      return 'border-2 border-blue-500 bg-blue-500/20 scale-[1.02] shadow-2xl ring-2 ring-blue-500/50 opacity-80 z-30 transition-all duration-150';
    }
    if (isDragOver) {
      return 'border-2 border-[#D4AF37] bg-[#D4AF37]/15 shadow-[0_0_15px_rgba(0,214,143,0.4)] relative before:absolute before:-top-1 before:left-0 before:right-0 before:h-1 before:bg-[#D4AF37] before:rounded-full transition-all duration-150';
    }
    return `${defaultBorder} hover:border-[#3A435E]`;
  };

  // Vector Placeholder Component for minimalist cartoon/vector illustrations
  const VectorPlaceholder: React.FC<{ type?: string; className?: string }> = ({ type = 'tshirt', className = '' }) => (
    <div className={`w-full h-full bg-gradient-to-br from-slate-100 via-slate-50 to-amber-50/20 flex items-center justify-center p-4 ${className}`}>
      <div className="w-16 h-16 rounded-2xl bg-white shadow-sm border border-slate-200/80 flex items-center justify-center text-[#D4AF37] group-hover:scale-110 transition-transform duration-300">
        {type === 'tshirt' && (
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H5v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10h1.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"></path>
          </svg>
        )}
        {type === 'bag' && (
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <path d="M16 10a4 4 0 0 1-8 0"></path>
          </svg>
        )}
        {type === 'box' && (
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
          </svg>
        )}
        {type === 'gadget' && (
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
            <line x1="12" y1="18" x2="12.01" y2="18"></line>
          </svg>
        )}
        {type !== 'tshirt' && type !== 'bag' && type !== 'box' && type !== 'gadget' && (
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          </svg>
        )}
      </div>
    </div>
  );

  const sampleProducts = [
    {
      id: 1,
      name: 'Classic Cotton T-Shirt',
      category: 'Apparel & Fashion',
      price: 0,
      oldPrice: 0,
      badge: 'Best Seller',
      image: '',
      vectorType: 'tshirt'
    },
    {
      id: 2,
      name: 'Minimalist Leather Wallet',
      category: 'Accessories & Gifts',
      price: 0,
      oldPrice: 0,
      badge: 'Eid Special',
      image: '',
      vectorType: 'box'
    },
    {
      id: 3,
      name: 'Canvas Everyday Tote Bag',
      category: 'Bags & Wallets',
      price: 0,
      oldPrice: 0,
      badge: 'Artisan',
      image: '',
      vectorType: 'bag'
    },
    {
      id: 4,
      name: 'Wireless Bluetooth Earbuds',
      category: 'Gadgets & Tech',
      price: 0,
      oldPrice: 0,
      badge: '11.11 Deal',
      image: '',
      vectorType: 'gadget'
    }
  ];

  const handleAddSection = (type: string) => {
    const id = `sec-${Date.now()}`;
    setAddedSections((prev) => [...prev, { id, name: type }]);
    setContentSectionsOrder((prev) => [...prev, { id, key: id, name: type, isCustom: true }]);
    setShowAddSectionModal(false);
    setHasUnsavedChanges(true);
    setActiveContentSub(id as any);
    setDrillDownSection(id);
  };

  const liveMerchant: MerchantProfile = {
    ...(merchant || {
      storeName: 'My Store',
      storeSlug: 'my-store',
      logoUrl: '',
      heroTitle: '',
      heroSubtitle: '',
      heroImage: '',
    }),
    ownerName: merchant?.ownerName || '',
    email: merchant?.email || '',
    phone: merchant?.phone || '',
    currency: merchant?.currency || 'BDT',
    storeName: storeLogoText,
    announcementText: announcementText,
    heroTitle: heroTitle,
    heroSubtitle: heroSubtitle,
    heroImage: heroImage,
    logoUrl: logoImageUrl || desktopLogoUrl || mobileLogoUrl || merchant?.logoUrl || '',
    themeConfig: {
      ...merchant?.themeConfig,
      headerSticky,
      headerBgColor,
      hideLanguage,
      hideCountry,
      showSearchBar,
      storeLogoText,
      logoImageUrl,
      desktopLogoUrl,
      mobileLogoUrl,
      logoHeight,
      showAnnouncement,
      announcementText,
      announcementBg,
      announcementLink,
      isMarquee,
      marqueeSpeed,
      announcementItems,
      showHeroBanner,
      carouselTransition,
      desktopCarouselHeight,
      mobileCarouselHeight,
      activeSlideIndex,
      slides,
      heroTitle,
      heroSubtitle,
      heroCtaText,
      heroImage,
      showCategories,
      categoriesHeading,
      categoriesSubtitle,
      categoriesLayout,
      categoriesSelection,
      categoriesItemsPerRow,
      categoriesShowItemCount,
      categoriesShowMoreButton,
      categoriesMoreButtonText,
      categoriesBgImage,
      categoriesOverlayOpacity,
      categoriesList,
      showFeaturedGrid,
      featuredHeading,
      productColumns,
      productsLayout,
      productsSelection,
      productsShowMoreButton,
      productsMoreButtonText,
      showCountdown,
      countdownTitle,
      countdownEndDate,
      countdownBgImage,
      countdownOverlayOpacity,
      countdownHours,
      countdownDiscount,
      showGallery,
      galleryHeading,
      galleryImages,
      showSocialBlock,
      socialTagline,
      facebookHandle,
      instagramHandle,
      whatsappNumber,
      tiktokHandle,
      youtubeHandle,
      showFacebook,
      showInstagram,
      showWhatsapp,
      showTikTok,
      showYouTube,
      socialButtonStyle,
      showVideo,
      videoTitle,
      videoUrl,
      videoCoverImage,
      videoFileUrl,
      videoAutoplay,
      videoMuted,
      footerLogoText,
      footerTagline,
      footerAboutText,
      footerLinksTitle,
      footerLinks,
      contactPhone,
      dhakaAddress,
      contactEmail,
      showPaymentBadges,
      mainSectionsOrder,
      contentSectionsOrder,
      footerSectionsOrder,
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#12151E] flex flex-col h-screen w-screen overflow-hidden text-slate-100 font-sans">

      {/* 1. TOP HEADER BAR */}
      <header className="h-14 bg-[#181B26] border-b border-[#2E3548] px-4 flex items-center justify-between gap-3 shrink-0 z-20 select-none">
        {/* Left Controls: Back Button & Theme status */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackOrClose}
            className="flex items-center gap-2 bg-[#252B3B] hover:bg-[#2E3548] text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-xl border border-[#3A435E] transition cursor-pointer"
            title="Exit Customizer"
          >
            <ArrowLeft className="w-4 h-4 text-slate-400" />
            <span>Back</span>
          </button>

          <div className="h-4 w-px bg-[#2E3548]" />

          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-white tracking-wide">{themeName}</h1>
            <span className="text-[10px] font-mono bg-[#2E3548] text-slate-400 px-1.5 py-0.5 rounded border border-[#3A435E]">v{themeVersion}</span>
          </div>
        </div>

        {/* Center: Page Selection & Device Toggle */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowPageDropdown(!showPageDropdown)}
              className="flex items-center gap-2 bg-[#252B3B] hover:bg-[#2E3548] text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-xl border border-[#3A435E] transition cursor-pointer"
            >
              <Layout className="w-4 h-4 text-slate-400" />
              {selectedPage}
              <ChevronDown className="w-3 h-3 text-slate-500" />
            </button>
          </div>

          <div className="bg-[#202533] border border-[#2E3548] p-1 rounded-xl flex items-center gap-1">
            <button
              onClick={() => setDeviceMode('desktop')}
              className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${deviceMode === 'desktop' ? 'bg-[#D4AF37] text-slate-950 font-bold shadow-xs' : 'text-slate-400 hover:text-white'}`}
            >
              <Monitor className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDeviceMode('mobile')}
              className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${deviceMode === 'mobile' ? 'bg-[#D4AF37] text-slate-950 font-bold shadow-xs' : 'text-slate-400 hover:text-white'}`}
            >
              <Smartphone className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Controls: Discard, History & Publish */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistoryModal(true)}
            className="p-2 text-slate-400 hover:text-white hover:bg-[#2E3548] rounded-xl transition cursor-pointer"
            title="View History"
          >
            <History className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowDiscardModal(true)}
            className="p-2 text-red-400 hover:text-white hover:bg-red-500/10 rounded-xl transition cursor-pointer"
            title="Discard Changes"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={handlePublish}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-1.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-600/20 transition"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Publish Changes</span>
          </button>
        </div>
      </header>

      {/* UNSAVED CHANGES NOTIFICATION BAR */}
      {hasUnsavedChanges && (
        <div className="bg-[#D4AF37]/10 border-b border-[#D4AF37]/20 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#D4AF37] text-xs font-bold">
            <Clock className="w-3.5 h-3.5" />
            <span>Unsaved changes pending</span>
          </div>
          <button
            onClick={handlePublish}
            className="bg-[#D4AF37] text-slate-950 font-bold px-3 py-1 rounded-lg text-xs hover:bg-[#FCF6BA] cursor-pointer transition"
          >
            Publish Changes
          </button>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {(showSuccessToast || toastMessage) && (
        <div className="absolute top-16 right-6 z-50 bg-[#D4AF37] text-slate-950 px-4 py-3 rounded-xl shadow-2xl font-bold text-xs flex items-center gap-2 border border-white/20 animate-in fade-in slide-in-from-top-2 duration-300">
          <CheckCircle2 className="w-4 h-4 stroke-[3]" />
          <span>{toastMessage || 'Theme changes published live to storefront successfully!'}</span>
        </div>
      )}

      {/* MAIN CONTAINER: LEFT SIDEBAR + RIGHT LIVE PREVIEW */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* 2. LEFT EDITOR SIDEBAR SHELL */}
        <aside className={`w-80 md:w-96 bg-[#181B26] border-r border-[#2E3548] flex flex-col h-full shrink-0 overflow-y-auto transition-all ${
          showMobileSidebar ? 'max-md:w-full max-md:absolute max-md:inset-0 max-md:z-30' : 'max-md:hidden'
        }`}>
          {/* Sidebar Header Title */}
          <div className="p-4 border-b border-[#2E3548] bg-[#1F2433] flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#D4AF37]" />
              <h2 className="text-sm font-extrabold text-white">
                {drillDownSection ? 'Section Editor' : 'Home page sections'}
              </h2>
            </div>
            <button
              onClick={() => {
                setAnnouncementText('🎉 Free Nationwide Shipping across Bangladesh on Orders Over ৳2,000!');
                setHeroTitle('Eid Ul Adha Special Collection 2026');
                setShowHeroBanner(true);
                setShowAnnouncement(true);
                setHasUnsavedChanges(true);
              }}
              className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 bg-[#282E3F] px-2 py-1 rounded-lg border border-[#3A435E] cursor-pointer"
              title="Reset to default settings"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>

          <div className="p-4 space-y-4">

            {drillDownSection !== null ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-left-2 duration-200">
                {/* Back to sections list button */}
                <button
                  type="button"
                  onClick={() => setDrillDownSection(null)}
                  className="w-full flex items-center justify-start gap-2.5 bg-[#252B3B] hover:bg-[#2E3548] text-[#D4AF37] hover:text-white text-xs font-bold px-3.5 py-2.5 rounded-xl border border-[#3A435E] hover:border-[#D4AF37]/50 transition cursor-pointer shadow-xs group"
                >
                  <ArrowLeft className="w-4 h-4 text-[#D4AF37] group-hover:-translate-x-1 transition-transform" />
                  <span>Back to sections list</span>
                </button>

                {/* 1. Header Settings */}
                {drillDownSection === 'h_settings' && (
                  <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-4 space-y-4">
                    <div className="flex items-center gap-2.5 pb-3 border-b border-[#2E3548]">
                      <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                        <Sliders className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-white">Header Settings</h3>
                        <p className="text-[11px] text-slate-400">Navigation, layout & background styles</p>
                      </div>
                    </div>

                    <div className="space-y-3 bg-[#131620] p-3 rounded-xl border border-[#2E3548] text-xs">
                      <div className="flex items-center justify-between">
                        <label className="text-slate-300 font-semibold cursor-pointer select-none">Sticky Navigation Bar</label>
                        <input
                          type="checkbox"
                          checked={headerSticky}
                          onChange={(e) => updateHeaderSticky(e.target.checked)}
                          className="w-4 h-4 accent-[#D4AF37] cursor-pointer"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <label className="text-slate-300 font-semibold cursor-pointer select-none">Hide Language</label>
                        <input
                          type="checkbox"
                          checked={hideLanguage}
                          onChange={(e) => updateHideLanguage(e.target.checked)}
                          className="w-4 h-4 accent-[#D4AF37] cursor-pointer"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <label className="text-slate-300 font-semibold cursor-pointer select-none">Hide Country</label>
                        <input
                          type="checkbox"
                          checked={hideCountry}
                          onChange={(e) => updateHideCountry(e.target.checked)}
                          className="w-4 h-4 accent-[#D4AF37] cursor-pointer"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <label className="text-slate-300 font-semibold cursor-pointer select-none">Show Search Bar</label>
                        <input
                          type="checkbox"
                          checked={showSearchBar}
                          onChange={(e) => updateShowSearchBar(e.target.checked)}
                          className="w-4 h-4 accent-[#D4AF37] cursor-pointer"
                        />
                      </div>

                      <div className="space-y-1 pt-1">
                        <label className="text-slate-400 text-[11px] block">Header Background Color</label>
                        <PremiumLockedWrapper>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={headerBgColor}
                              onChange={(e) => updateHeaderBgColor(e.target.value)}
                              className="w-7 h-7 rounded bg-transparent border-0 cursor-pointer"
                            />
                            <input
                              type="text"
                              value={headerBgColor}
                              onChange={(e) => updateHeaderBgColor(e.target.value)}
                              className="bg-[#202533] border border-[#2E3548] text-white px-2 py-1 rounded text-xs font-mono uppercase w-24"
                            />
                          </div>
                        </PremiumLockedWrapper>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Header Logo */}
                {drillDownSection === 'h_logo' && (
                  <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-4 space-y-4">
                    <div className="flex items-center gap-2.5 pb-3 border-b border-[#2E3548]">
                      <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                        <ImageIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-white">Header Logo</h3>
                        <p className="text-[11px] text-slate-400">Desktop & mobile logo dimensions</p>
                      </div>
                    </div>

                    <div className="space-y-3 bg-[#131620] p-3 rounded-xl border border-[#2E3548] text-xs">
                      <div className="space-y-1">
                        <label className="text-slate-300 font-semibold block">Store Logo Text</label>
                        <input
                          type="text"
                          value={storeLogoText}
                          onChange={(e) => setStoreLogoText(e.target.value)}
                          className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-slate-300 font-semibold block">Desktop Logo (200x80px)</label>
                          <span className="text-[10px] text-[#D4AF37] font-mono">200x80px</span>
                        </div>
                        {desktopLogoUrl && (
                          <div className="flex items-center gap-2 p-2 bg-[#202533] border border-[#2E3548] rounded-lg">
                            <img src={desktopLogoUrl} alt="Desktop Logo Preview" className="h-7 max-w-[100px] object-contain bg-slate-900 p-1 rounded" />
                            <button
                              type="button"
                              onClick={() => setDesktopLogoUrl('')}
                              className="ml-auto text-red-400 hover:text-red-300 text-xs font-bold cursor-pointer"
                            >
                              Clear
                            </button>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            placeholder="Image URL or upload..."
                            value={desktopLogoUrl}
                            onChange={(e) => setDesktopLogoUrl(e.target.value)}
                            className="flex-1 bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                          />
                          <label className="bg-[#282E3F] hover:bg-[#32394E] border border-[#3A435E] text-slate-200 text-xs font-bold px-2.5 py-2 rounded-lg cursor-pointer shrink-0 flex items-center gap-1 transition">
                            <Upload className="w-3.5 h-3.5 text-[#D4AF37]" />
                            <span>Upload</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = (event) => {
                                    if (event.target?.result) {
                                      setDesktopLogoUrl(event.target.result as string);
                                    }
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </label>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-slate-300 font-semibold block">Mobile Logo (150x60px)</label>
                          <span className="text-[10px] text-[#D4AF37] font-mono">150x60px</span>
                        </div>
                        {mobileLogoUrl && (
                          <div className="flex items-center gap-2 p-2 bg-[#202533] border border-[#2E3548] rounded-lg">
                            <img src={mobileLogoUrl} alt="Mobile Logo Preview" className="h-6 max-w-[80px] object-contain bg-slate-900 p-1 rounded" />
                            <button
                              type="button"
                              onClick={() => setMobileLogoUrl('')}
                              className="ml-auto text-red-400 hover:text-red-300 text-xs font-bold cursor-pointer"
                            >
                              Clear
                            </button>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            placeholder="Image URL or upload..."
                            value={mobileLogoUrl}
                            onChange={(e) => setMobileLogoUrl(e.target.value)}
                            className="flex-1 bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                          />
                          <label className="bg-[#282E3F] hover:bg-[#32394E] border border-[#3A435E] text-slate-200 text-xs font-bold px-2.5 py-2 rounded-lg cursor-pointer shrink-0 flex items-center gap-1 transition">
                            <Upload className="w-3.5 h-3.5 text-[#D4AF37]" />
                            <span>Upload</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = (event) => {
                                    if (event.target?.result) {
                                      setMobileLogoUrl(event.target.result as string);
                                    }
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </label>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-slate-400 text-[11px]">
                          <span>Logo Height</span>
                          <span>{logoHeight}px</span>
                        </div>
                        <input
                          type="range"
                          min="20"
                          max="60"
                          value={logoHeight}
                          onChange={(e) => setLogoHeight(Number(e.target.value))}
                          className="w-full accent-[#D4AF37]"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Header Announcement Bar */}
                {drillDownSection === 'h_announcement' && (
                  <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-4 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-[#2E3548]">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                          <Megaphone className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-white">Announcement Bar</h3>
                          <p className="text-[11px] text-slate-400">Marquee, offer banners & tickers</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateShowAnnouncement(!showAnnouncement)}
                        className="p-1.5 rounded-lg bg-[#282E3F] border border-[#3A435E] text-slate-400 hover:text-white transition cursor-pointer"
                        title={showAnnouncement ? "Hide Announcement Bar" : "Show Announcement Bar"}
                      >
                        {showAnnouncement ? <Eye className="w-4 h-4 text-[#D4AF37]" /> : <EyeOff className="w-4 h-4 text-slate-500" />}
                      </button>
                    </div>

                    <div className="space-y-3 bg-[#131620] p-3 rounded-xl border border-[#2E3548] text-xs">
                      {/* Primary Announcement Text — directly connected to live preview + publish */}
                      <div className="space-y-1">
                        <label className="text-slate-300 font-semibold block">Announcement Bar Text</label>
                        <input
                          type="text"
                          placeholder="e.g. 🎉 Free shipping on orders over ৳2,000!"
                          value={announcementText}
                          onChange={(e) => updateAnnouncementText(e.target.value)}
                          className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                        />
                        <p className="text-[10px] text-slate-500">This text appears instantly in the live preview and is saved to your storefront on publish.</p>
                      </div>

                      <div className="flex items-center justify-between">
                        <label className="text-slate-300 font-semibold cursor-pointer">Show Announcement Bar</label>
                        <input
                          type="checkbox"
                          checked={showAnnouncement}
                          onChange={(e) => updateShowAnnouncement(e.target.checked)}
                          className="w-4 h-4 accent-[#D4AF37] cursor-pointer"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <label className="text-slate-300 font-semibold cursor-pointer">Marquee Scrolling Effect</label>
                        <input
                          type="checkbox"
                          checked={isMarquee}
                          onChange={(e) => { setIsMarquee(e.target.checked); markDirty(); }}
                          className="w-4 h-4 accent-[#D4AF37] cursor-pointer"
                        />
                      </div>

                      {isMarquee && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-slate-400 text-[11px]">
                            <span>Scroll Duration (s)</span>
                            <span>{marqueeSpeed}s</span>
                          </div>
                          <input
                            type="range"
                            min="5"
                            max="40"
                            value={marqueeSpeed}
                            onChange={(e) => { setMarqueeSpeed(Number(e.target.value)); markDirty(); }}
                            className="w-full accent-[#D4AF37]"
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <label className="text-slate-300 font-semibold block">Announcement Messages ({announcementItems.length})</label>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {announcementItems.map((itemText, idx) => (
                            <div key={idx} className="flex items-center gap-1.5 bg-[#202533] p-2 rounded-lg border border-[#2E3548]">
                              <input
                                type="text"
                                value={itemText}
                                onChange={(e) => {
                                  const updated = [...announcementItems];
                                  updated[idx] = e.target.value;
                                  updateAnnouncementItems(updated);
                                }}
                                className="flex-1 bg-transparent text-white text-xs font-semibold focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => updateAnnouncementItems(prev => prev.filter((_, i) => i !== idx))}
                                className="text-red-400 hover:text-red-300 p-0.5 cursor-pointer shrink-0"
                                title="Remove item"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>

                        <div className="flex gap-1.5 pt-1">
                          <input
                            type="text"
                            placeholder="Add announcement text..."
                            value={newAnnouncementInput}
                            onChange={(e) => setNewAnnouncementInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && newAnnouncementInput.trim()) {
                                e.preventDefault();
                                updateAnnouncementItems(prev => [...prev, newAnnouncementInput.trim()]);
                                setNewAnnouncementInput('');
                              }
                            }}
                            className="flex-1 bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (newAnnouncementInput.trim()) {
                                updateAnnouncementItems(prev => [...prev, newAnnouncementInput.trim()]);
                                setNewAnnouncementInput('');
                              }
                            }}
                            className="bg-[#D4AF37] hover:bg-[#FCF6BA] text-slate-950 font-bold px-3 py-2 rounded-lg text-xs transition cursor-pointer shrink-0"
                          >
                            Add
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-slate-400 text-[11px] block">Background Banner Color</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={announcementBg}
                            onChange={(e) => updateAnnouncementBg(e.target.value)}
                            className="w-7 h-7 rounded bg-transparent border-0 cursor-pointer"
                          />
                          <input
                            type="text"
                            value={announcementBg}
                            onChange={(e) => updateAnnouncementBg(e.target.value)}
                            className="bg-[#202533] border border-[#2E3548] text-white px-2 py-1 rounded text-xs font-mono uppercase w-24"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. Image Carousel */}
                {drillDownSection === 'c_carousel' && (
                  <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-4 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-[#2E3548]">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                          <ImageIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-white">Image Carousel</h3>
                          <p className="text-[11px] text-slate-400">Hero banners & campaign slides</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowHeroBanner(!showHeroBanner)}
                        className="p-1.5 rounded-lg bg-[#282E3F] border border-[#3A435E] text-slate-400 hover:text-white transition cursor-pointer"
                        title={showHeroBanner ? "Hide Image Carousel" : "Show Image Carousel"}
                      >
                        {showHeroBanner ? <Eye className="w-4 h-4 text-[#D4AF37]" /> : <EyeOff className="w-4 h-4 text-slate-500" />}
                      </button>
                    </div>

                    <div className="space-y-3 bg-[#131620] p-3 rounded-xl border border-[#2E3548] text-xs">
                      <div className="space-y-1.5">
                        <label className="text-slate-300 font-semibold block">Transition Effect</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setCarouselTransition('slide')}
                            className={`px-3 py-2 rounded-lg text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                              carouselTransition === 'slide'
                                ? 'bg-[#D4AF37]/10 border-[#D4AF37] text-[#D4AF37]'
                                : 'bg-[#202533] border-[#2E3548] text-slate-300 hover:bg-[#282E3F]'
                            }`}
                          >
                            <span>Slide Animation</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setCarouselTransition('fade')}
                            className={`px-3 py-2 rounded-lg text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                              carouselTransition === 'fade'
                                ? 'bg-[#D4AF37]/10 border-[#D4AF37] text-[#D4AF37]'
                                : 'bg-[#202533] border-[#2E3548] text-slate-300 hover:bg-[#282E3F]'
                            }`}
                          >
                            <span>Fade Transition</span>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="space-y-1">
                          <div className="flex justify-between text-slate-400 text-[11px]">
                            <span>Desktop Height</span>
                            <span>{desktopCarouselHeight}px</span>
                          </div>
                          <input
                            type="range"
                            min="300"
                            max="650"
                            value={desktopCarouselHeight}
                            onChange={(e) => setDesktopCarouselHeight(Number(e.target.value))}
                            className="w-full accent-[#D4AF37]"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-slate-400 text-[11px]">
                            <span>Mobile Height</span>
                            <span>{mobileCarouselHeight}px</span>
                          </div>
                          <input
                            type="range"
                            min="200"
                            max="450"
                            value={mobileCarouselHeight}
                            onChange={(e) => setMobileCarouselHeight(Number(e.target.value))}
                            className="w-full accent-[#D4AF37]"
                          />
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-[#2E3548]">
                        <div className="flex justify-between items-center">
                          <label className="text-slate-300 font-semibold block">Slide Manager ({slides.length})</label>
                        </div>

                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                          {slides.map((slideItem, idx) => (
                            <div
                              key={slideItem.id}
                              className={`p-2.5 rounded-xl border transition ${
                                activeSlideIndex === idx ? 'bg-[#202533] border-[#D4AF37]' : 'bg-[#181B26] border-[#2E3548]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono text-[#D4AF37] font-bold">#{idx + 1}</span>
                                  <span className="font-bold text-white text-xs truncate max-w-[130px]">{slideItem.title}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveSlideIndex(idx);
                                      setHeroTitle(slideItem.title);
                                      setHeroSubtitle(slideItem.subtitle);
                                      setHeroCtaText(slideItem.ctaText);
                                      setHeroImage(slideItem.image);
                                    }}
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer ${
                                      activeSlideIndex === idx ? 'bg-[#D4AF37] text-slate-950' : 'bg-[#282E3F] text-slate-300 hover:text-white'
                                    }`}
                                  >
                                    {activeSlideIndex === idx ? 'Active' : 'Preview'}
                                  </button>
                                  {slides.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const filtered = slides.filter((_, i) => i !== idx);
                                        setSlides(filtered);
                                        if (activeSlideIndex >= filtered.length) {
                                          setActiveSlideIndex(Math.max(0, filtered.length - 1));
                                        }
                                      }}
                                      className="text-red-400 hover:text-red-300 p-1 cursor-pointer"
                                      title="Delete slide"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="space-y-1.5 text-xs">
                                <input
                                  type="text"
                                  placeholder="Title"
                                  value={slideItem.title}
                                  onChange={(e) => {
                                    const updatedVal = e.target.value;
                                    setSlides(prev => prev.map((item, i) => i === idx ? { ...item, title: updatedVal } : item));
                                    if (activeSlideIndex === idx) updateHeroTitle(updatedVal);
                                  }}
                                  className="w-full bg-[#131620] border border-[#2E3548] text-white p-1.5 rounded text-xs"
                                />
                                <input
                                  type="text"
                                  placeholder="Subtitle"
                                  value={slideItem.subtitle}
                                  onChange={(e) => {
                                    const updatedVal = e.target.value;
                                    setSlides(prev => prev.map((item, i) => i === idx ? { ...item, subtitle: updatedVal } : item));
                                    if (activeSlideIndex === idx) updateHeroSubtitle(updatedVal);
                                  }}
                                  className="w-full bg-[#131620] border border-[#2E3548] text-white p-1.5 rounded text-xs"
                                />
                                <div className="flex gap-1.5">
                                  <input
                                    type="text"
                                    placeholder="CTA Text"
                                    value={slideItem.ctaText}
                                    onChange={(e) => {
                                      const updatedVal = e.target.value;
                                      setSlides(prev => prev.map((item, i) => i === idx ? { ...item, ctaText: updatedVal } : item));
                                      if (activeSlideIndex === idx) { setHeroCtaText(updatedVal); markDirty(); }
                                    }}
                                    className="w-1/2 bg-[#131620] border border-[#2E3548] text-white p-1.5 rounded text-xs"
                                  />
                                  <input
                                    type="text"
                                    placeholder="CTA Link"
                                    value={slideItem.ctaLink}
                                    onChange={(e) => {
                                      const updatedVal = e.target.value;
                                      setSlides(prev => prev.map((item, i) => i === idx ? { ...item, ctaLink: updatedVal } : item));
                                    }}
                                    className="w-1/2 bg-[#131620] border border-[#2E3548] text-white p-1.5 rounded text-xs"
                                  />
                                </div>
                                <div className="flex items-center gap-1.5 pt-1">
                                  <input
                                    type="text"
                                    placeholder="Slide Image URL..."
                                    value={slideItem.image}
                                    onChange={(e) => {
                                      const updatedVal = e.target.value;
                                      setSlides(prev => prev.map((item, i) => i === idx ? { ...item, image: updatedVal } : item));
                                      if (activeSlideIndex === idx) updateHeroImage(updatedVal);
                                    }}
                                    className="flex-1 bg-[#131620] border border-[#2E3548] text-white p-1.5 rounded text-xs"
                                  />
                                  <label className="bg-[#282E3F] hover:bg-[#32394E] text-slate-200 text-[10px] font-bold px-2 py-1.5 rounded cursor-pointer shrink-0 flex items-center gap-1 border border-[#3A435E]">
                                    <Upload className="w-3 h-3 text-[#D4AF37]" />
                                    <span>Upload</span>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          const reader = new FileReader();
                                          reader.onload = (event) => {
                                            if (event.target?.result) {
                                              const newImg = event.target.result as string;
                                              setSlides(prev => prev.map((item, i) => i === idx ? { ...item, image: newImg } : item));
                                              if (activeSlideIndex === idx) updateHeroImage(newImg);
                                            }
                                          };
                                          reader.readAsDataURL(file);
                                        }
                                      }}
                                    />
                                  </label>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const newSlide = {
                              id: `slide-${Date.now()}`,
                              title: `New Campaign Slide ${slides.length + 1}`,
                              subtitle: 'Exclusive discounts and seasonal offers across Bangladesh.',
                              ctaText: 'Shop Now',
                              ctaLink: '/collections/new',
                              image: ''
                            };
                            const updated = [...slides, newSlide];
                            setSlides(updated);
                            setActiveSlideIndex(updated.length - 1);
                            setHeroTitle(newSlide.title);
                            setHeroSubtitle(newSlide.subtitle);
                            setHeroCtaText(newSlide.ctaText);
                            setHeroImage(newSlide.image);
                          }}
                          className="w-full mt-1 bg-[#202533] hover:bg-[#282E3F] border border-dashed border-[#3A435E] hover:border-[#D4AF37] text-slate-200 text-xs font-bold p-2.5 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 text-[#D4AF37]" />
                          <span>+ Add Slide</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. Categories */}
                {drillDownSection === 'c_categories' && (
                  <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-4 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-[#2E3548]">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                          <Grid className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-white">Categories</h3>
                          <p className="text-[11px] text-slate-400">Featured collection grid & overlays</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCategories(!showCategories)}
                        className="p-1.5 rounded-lg bg-[#282E3F] border border-[#3A435E] text-slate-400 hover:text-white transition cursor-pointer"
                        title={showCategories ? "Hide Categories" : "Show Categories"}
                      >
                        {showCategories ? <Eye className="w-4 h-4 text-[#D4AF37]" /> : <EyeOff className="w-4 h-4 text-slate-500" />}
                      </button>
                    </div>

                    <div className="space-y-4 bg-[#131620] p-3 rounded-xl border border-[#2E3548] text-xs">
                      {/* Layout */}
                      <div className="space-y-1">
                        <label className="text-slate-300 font-semibold block">Display Layout</label>
                        <select
                          value={categoriesLayout}
                          onChange={(e) => setCategoriesLayout(e.target.value as 'Carousel' | 'Grid' | 'List')}
                          className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                        >
                          <option>Carousel</option>
                          <option>Grid</option>
                          <option>List</option>
                        </select>
                      </div>

                      {/* Title & Subtitle */}
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-slate-300 font-semibold block">Title</label>
                          <input
                            type="text"
                            value={categoriesHeading}
                            onChange={(e) => setCategoriesHeading(e.target.value)}
                            className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-slate-300 font-semibold block">Subtitle</label>
                          <input
                            type="text"
                            value={categoriesSubtitle}
                            onChange={(e) => setCategoriesSubtitle(e.target.value)}
                            className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                          />
                        </div>
                      </div>

                      {/* Selection Logic */}
                      <div className="space-y-1">
                        <label className="text-slate-300 font-semibold block">Select Categories</label>
                        <select
                          value={categoriesSelection}
                          onChange={(e) => setCategoriesSelection(e.target.value as 'All' | 'Featured' | 'Manual')}
                          className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                        >
                          <option>All categories</option>
                          <option>Featured categories</option>
                          <option>Manual selection</option>
                        </select>
                      </div>

                      {/* Add Category */}
                      <button className="w-full py-2 bg-[#282E3F] border border-[#3A435E] text-slate-300 rounded-lg text-xs font-semibold hover:text-white transition">
                        + Add Category
                      </button>

                      {/* Grid Controls & Display Options */}
                      <div className="space-y-3 pt-2 border-t border-[#2E3548]">
                        <div className="space-y-1">
                          <label className="text-slate-300 font-semibold block">Items per row</label>
                          <input
                            type="number"
                            value={categoriesItemsPerRow}
                            onChange={(e) => setCategoriesItemsPerRow(parseInt(e.target.value))}
                            className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                          />
                        </div>
                        <label className="flex items-center gap-2 text-slate-300 font-semibold">
                          <input
                            type="checkbox"
                            checked={categoriesShowItemCount}
                            onChange={(e) => setCategoriesShowItemCount(e.target.checked)}
                            className="accent-[#D4AF37]"
                          />
                          Display Category Item Count
                        </label>
                      </div>

                      {/* More Button */}
                      <div className="space-y-2 pt-2 border-t border-[#2E3548]">
                        <label className="flex items-center gap-2 text-slate-300 font-semibold">
                          <input
                            type="checkbox"
                            checked={categoriesShowMoreButton}
                            onChange={(e) => setCategoriesShowMoreButton(e.target.checked)}
                            className="accent-[#D4AF37]"
                          />
                          Display More Button
                        </label>
                        <div className="space-y-1">
                          <label className="text-slate-400 text-[10px] block">More Button Text</label>
                          <input
                            type="text"
                            value={categoriesMoreButtonText}
                            onChange={(e) => setCategoriesMoreButtonText(e.target.value)}
                            className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                          />
                        </div>
                      </div>
                    </div>

                  </div>
                )}

                {/* 6. Products */}
                {drillDownSection === 'c_products' && (
                  <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-4 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-[#2E3548]">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                          <ShoppingBag className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-white">Products</h3>
                          <p className="text-[11px] text-slate-400">Standard Product Section</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowFeaturedGrid(!showFeaturedGrid)}
                        className="p-1.5 rounded-lg bg-[#282E3F] border border-[#3A435E] text-slate-400 hover:text-white transition cursor-pointer"
                        title={showFeaturedGrid ? "Hide Products" : "Show Products"}
                      >
                        {showFeaturedGrid ? <Eye className="w-4 h-4 text-[#D4AF37]" /> : <EyeOff className="w-4 h-4 text-slate-500" />}
                      </button>
                    </div>

                    <div className="space-y-4 bg-[#131620] p-3 rounded-xl border border-[#2E3548] text-xs">
                      {/* Layout */}
                      <div className="space-y-1">
                        <label className="text-slate-300 font-semibold block">Layout</label>
                        <select
                          value={productsLayout}
                          onChange={(e) => setProductsLayout(e.target.value as 'Carousel' | 'Grid' | 'List')}
                          className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs cursor-pointer"
                        >
                          <option>Carousel</option>
                          <option>Grid</option>
                          <option>List</option>
                        </select>
                      </div>

                      {/* Title */}
                      <div className="space-y-1">
                        <label className="text-slate-300 font-semibold block">Section Title</label>
                        <input
                          type="text"
                          value={featuredHeading}
                          onChange={(e) => setFeaturedHeading(e.target.value)}
                          className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                        />
                      </div>

                      {/* Product Selection */}
                      <div className="space-y-1">
                        <label className="text-slate-300 font-semibold block">Select Products</label>
                        <select
                          value={productsSelection}
                          onChange={(e) => setProductsSelection(e.target.value)}
                          className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs cursor-pointer"
                        >
                          <option>On sale products</option>
                          <option>Recent products</option>
                          <option>Category products</option>
                          <option>Select products</option>
                        </select>
                      </div>

                      {/* Create Category */}
                      <button className="w-full py-2 bg-[#282E3F] border border-[#3A435E] text-slate-300 rounded-lg text-xs font-semibold hover:text-white transition">
                        + Create new category
                      </button>

                      {/* More Button */}
                      <div className="space-y-2 pt-2 border-t border-[#2E3548]">
                        <label className="flex items-center gap-2 text-slate-300 font-semibold">
                          <input
                            type="checkbox"
                            checked={productsShowMoreButton}
                            onChange={(e) => setProductsShowMoreButton(e.target.checked)}
                            className="accent-[#D4AF37]"
                          />
                          Display More Button
                        </label>
                        <div className="space-y-1">
                          <label className="text-slate-400 text-[10px] block">More Button Text</label>
                          <input
                            type="text"
                            value={productsMoreButtonText}
                            onChange={(e) => setProductsMoreButtonText(e.target.value)}
                            className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 7. Countdown Timer */}
                {drillDownSection === 'c_countdown' && (
                  <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-4 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-[#2E3548]">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-white">Countdown Timer</h3>
                          <p className="text-[11px] text-slate-400">Flash sale timer & promo banner</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCountdown(!showCountdown)}
                        className="p-1.5 rounded-lg bg-[#282E3F] border border-[#3A435E] text-slate-400 hover:text-white transition cursor-pointer"
                        title={showCountdown ? "Hide Countdown" : "Show Countdown"}
                      >
                        {showCountdown ? <Eye className="w-4 h-4 text-[#D4AF37]" /> : <EyeOff className="w-4 h-4 text-slate-500" />}
                      </button>
                    </div>

                    <div className="space-y-3 bg-[#131620] p-3 rounded-xl border border-[#2E3548] text-xs">
                      <div className="space-y-1">
                        <label className="text-slate-300 font-semibold block">Timer Heading Title</label>
                        <input
                          type="text"
                          value={countdownTitle}
                          onChange={(e) => setCountdownTitle(e.target.value)}
                          className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-slate-300 font-semibold block">Discount Highlight Text</label>
                        <input
                          type="text"
                          value={countdownDiscount}
                          onChange={(e) => setCountdownDiscount(e.target.value)}
                          className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-slate-300 font-semibold text-xs">
                          <span>Remaining Hours (Demo)</span>
                          <span className="text-[#D4AF37] font-mono">{countdownHours}h</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="72"
                          value={countdownHours}
                          onChange={(e) => setCountdownHours(Number(e.target.value))}
                          className="w-full accent-[#D4AF37]"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-slate-300 font-semibold block">Section Background Image</label>
                          {countdownBgImage && (
                            <button
                              type="button"
                              onClick={() => setCountdownBgImage('')}
                              className="text-red-400 hover:text-red-300 text-[10px] font-bold cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            placeholder="Background Image URL or upload..."
                            value={countdownBgImage}
                            onChange={(e) => setCountdownBgImage(e.target.value)}
                            className="flex-1 bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                          />
                          <label className="bg-[#282E3F] hover:bg-[#32394E] border border-[#3A435E] text-slate-200 text-xs font-bold px-2.5 py-2 rounded-lg cursor-pointer shrink-0 flex items-center gap-1 transition">
                            <Upload className="w-3.5 h-3.5 text-[#D4AF37]" />
                            <span>Upload</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = (event) => {
                                    if (event.target?.result) {
                                      setCountdownBgImage(event.target.result as string);
                                    }
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 8. Gallery */}
                <input
                  type="file"
                  ref={galleryAddInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={(e) => handleGalleryImageUpload(e, 'add')}
                />
                <input
                  type="file"
                  ref={galleryUpdateInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={(e) => handleGalleryImageUpload(e, 'update', updatingGalleryIndex ?? undefined)}
                />
                {drillDownSection === 'c_gallery' && (
                  <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-4 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-[#2E3548]">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                          <Grid className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-white">Gallery</h3>
                          <p className="text-[11px] text-slate-400">Artisan craftsmanship photo showcase</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowGallery(!showGallery)}
                        className="p-1.5 rounded-lg bg-[#282E3F] border border-[#3A435E] text-slate-400 hover:text-white transition cursor-pointer"
                        title={showGallery ? "Hide Gallery" : "Show Gallery"}
                      >
                        {showGallery ? <Eye className="w-4 h-4 text-[#D4AF37]" /> : <EyeOff className="w-4 h-4 text-slate-500" />}
                      </button>
                    </div>

                    <div className="space-y-3 bg-[#131620] p-3 rounded-xl border border-[#2E3548] text-xs">
                      <div className="space-y-1">
                        <label className="text-slate-300 font-semibold block">Section Heading</label>
                        <input
                          type="text"
                          value={galleryHeading}
                          onChange={(e) => setGalleryHeading(e.target.value)}
                          className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-slate-300 font-semibold block">Gallery Images ({galleryImages.length})</label>
                          <button
                            type="button"
                            onClick={() => galleryAddInputRef.current?.click()}
                            className="text-[10px] bg-[#D4AF37]/10 text-[#D4AF37] px-2 py-1 rounded-md font-bold hover:bg-[#D4AF37]/20"
                          >
                            + Add Image
                          </button>
                        </div>
                        <div className="space-y-3">
                          {galleryImages.map((img, idx) => (
                            <div key={idx} className="bg-[#202533] p-2 rounded-lg border border-[#2E3548] space-y-2">
                              <div className="flex items-center gap-2">
                                <img
                                  src={img.url}
                                  alt={`Gallery ${idx + 1}`}
                                  className="w-12 h-12 object-cover rounded-lg border border-[#2E3548] cursor-pointer hover:border-[#D4AF37] transition"
                                  onClick={() => {
                                    setUpdatingGalleryIndex(idx);
                                    galleryUpdateInputRef.current?.click();
                                  }}
                                />
                                <div className="flex-1 space-y-1">
                                  <input
                                    type="text"
                                    value={img.url}
                                    onChange={(e) => {
                                      const newImages = [...galleryImages];
                                      newImages[idx].url = e.target.value;
                                      setGalleryImages(newImages);
                                    }}
                                    className="w-full bg-[#131620] border border-[#2E3548] text-white p-1 rounded-md text-[10px]"
                                    placeholder="Image URL"
                                  />
                                  <div className="flex gap-1">
                                    <input
                                      type="text"
                                      value={img.caption || ''}
                                      onChange={(e) => {
                                        const newImages = [...galleryImages];
                                        newImages[idx].caption = e.target.value;
                                        setGalleryImages(newImages);
                                      }}
                                      className="w-full bg-[#131620] border border-[#2E3548] text-white p-1 rounded-md text-[10px]"
                                      placeholder="Caption"
                                    />
                                    <input
                                      type="text"
                                      value={img.link || ''}
                                      onChange={(e) => {
                                        const newImages = [...galleryImages];
                                        newImages[idx].link = e.target.value;
                                        setGalleryImages(newImages);
                                      }}
                                      className="w-full bg-[#131620] border border-[#2E3548] text-white p-1 rounded-md text-[10px]"
                                      placeholder="Link"
                                    />
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setGalleryImages(prev => prev.filter((_, i) => i !== idx))}
                                  className="text-slate-500 hover:text-red-500 transition cursor-pointer"
                                  title="Remove image"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 9. Logo & Social Media */}
                {drillDownSection === 'c_brand_social' && (
                  <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-4 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-[#2E3548]">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400">
                          <Share2 className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-white">Logo & Social Media</h3>
                          <p className="text-[11px] text-slate-400">Social feed links & Instagram handles</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowSocialBlock(!showSocialBlock)}
                        className="p-1.5 rounded-lg bg-[#282E3F] border border-[#3A435E] text-slate-400 hover:text-white transition cursor-pointer"
                        title={showSocialBlock ? "Hide Social Section" : "Show Social Section"}
                      >
                        {showSocialBlock ? <Eye className="w-4 h-4 text-[#D4AF37]" /> : <EyeOff className="w-4 h-4 text-slate-500" />}
                      </button>
                    </div>

                    <div className="space-y-4 bg-[#131620] p-3 rounded-xl border border-[#2E3548] text-xs">
                      <div className="space-y-1">
                        <label className="text-slate-300 font-semibold block">Social Tagline</label>
                        <input
                          type="text"
                          value={socialTagline}
                          onChange={(e) => setSocialTagline(e.target.value)}
                          className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-slate-300 font-semibold block">Button Style</label>
                        <select
                          value={socialButtonStyle}
                          onChange={(e) => setSocialButtonStyle(e.target.value)}
                          className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                        >
                          <option>Modern Pill Buttons</option>
                          <option>Classic Icons Only</option>
                          <option>Full Banner Card</option>
                        </select>
                      </div>

                      {[
                        { label: 'Facebook', icon: <Facebook className="w-3 h-3" />, value: facebookHandle, onChange: setFacebookHandle, show: showFacebook, setShow: setShowFacebook },
                        { label: 'Instagram', icon: <Instagram className="w-3 h-3" />, value: instagramHandle, onChange: setInstagramHandle, show: showInstagram, setShow: setShowInstagram },
                        { label: 'WhatsApp', icon: <MessageCircle className="w-3 h-3" />, value: whatsappNumber, onChange: setWhatsappNumber, show: showWhatsapp, setShow: setShowWhatsapp },
                        { label: 'TikTok', icon: <Music className="w-3 h-3" />, value: tiktokHandle, onChange: setTiktokHandle, show: showTikTok, setShow: setShowTikTok },
                        { label: 'YouTube', icon: <Youtube className="w-3 h-3" />, value: youtubeHandle, onChange: setYoutubeHandle, show: showYouTube, setShow: setShowYouTube },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center gap-2">
                          <div className="flex-1 space-y-1">
                            <label className="text-slate-300 font-semibold block flex items-center gap-1.5">
                              {item.icon} {item.label} Handle
                            </label>
                            <input
                              type="text"
                              value={item.value}
                              onChange={(e) => item.onChange(e.target.value)}
                              className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                            />
                          </div>
                          <div className="mt-5">
                            <input
                              type="checkbox"
                              checked={item.show}
                              onChange={(e) => item.setShow(e.target.checked)}
                              className="accent-[#D4AF37] w-4 h-4 cursor-pointer"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 10. Video */}
                <input
                  type="file"
                  ref={videoInputRef}
                  className="hidden"
                  accept="video/*"
                  onChange={handleVideoUpload}
                />
                {drillDownSection === 'c_video' && (
                  <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-4 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-[#2E3548]">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 text-[#D4AF37]">
                          <Video className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-white">Video</h3>
                          <p className="text-[11px] text-slate-400">YouTube embed & local video player</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowVideo(!showVideo)}
                        className="p-1.5 rounded-lg bg-[#282E3F] border border-[#3A435E] text-slate-400 hover:text-white transition cursor-pointer"
                        title={showVideo ? "Hide Video Section" : "Show Video Section"}
                      >
                        {showVideo ? <Eye className="w-4 h-4 text-[#D4AF37]" /> : <EyeOff className="w-4 h-4 text-slate-500" />}
                      </button>
                    </div>

                    <div className="space-y-3 bg-[#131620] p-3 rounded-xl border border-[#2E3548] text-xs">
                      <div className="space-y-1">
                        <label className="text-slate-300 font-semibold block">Video Section Title</label>
                        <input
                          type="text"
                          value={videoTitle}
                          onChange={(e) => setVideoTitle(e.target.value)}
                          className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-slate-300 font-semibold block">Video Source</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={videoUrl}
                            onChange={(e) => setVideoUrl(e.target.value)}
                            className="flex-1 bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                            placeholder="Video URL (YouTube/Vimeo)"
                          />
                          <button
                            type="button"
                            onClick={() => videoInputRef.current?.click()}
                            className="bg-[#282E3F] border border-[#3A435E] text-white p-2 rounded-lg text-xs font-semibold hover:bg-[#3A435E] transition"
                          >
                            Upload File
                          </button>
                        </div>
                        {videoCoverImage && (
                          <div className="mt-2">
                            <img src={videoCoverImage} alt="Video Thumbnail" className="w-full h-24 object-cover rounded-lg border border-[#2E3548]" />
                          </div>
                        )}
                      </div>

                      <div className="space-y-2 pt-2 border-t border-[#2E3548]">
                        <label className="flex items-center justify-between">
                          <span className="font-semibold text-slate-200">Autoplay Video</span>
                          <input
                            type="checkbox"
                            checked={videoAutoplay}
                            onChange={(e) => {
                              setVideoAutoplay(e.target.checked);
                              if (e.target.checked) setVideoMuted(true);
                            }}
                            className="w-4 h-4 accent-[#D4AF37]"
                          />
                        </label>
                        <label className="flex items-center justify-between">
                          <span className="font-semibold text-slate-200">Mute Video by Default</span>
                          <input
                            type="checkbox"
                            checked={videoMuted}
                            onChange={(e) => setVideoMuted(e.target.checked)}
                            className="w-4 h-4 accent-[#D4AF37]"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* 11. Footer Logo */}
                {['f_logo', 'logo'].includes(drillDownSection || '') && (
                  <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-4 space-y-4">
                    <div className="flex items-center gap-2.5 pb-3 border-b border-[#2E3548]">
                      <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                        <ImageIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-white">Footer Logo & Tagline</h3>
                        <p className="text-[11px] text-slate-400">Brand identity at page footer</p>
                      </div>
                    </div>

                    <div className="space-y-3 bg-[#131620] p-3 rounded-xl border border-[#2E3548] text-xs">
                      <div className="space-y-1">
                        <label className="text-slate-300 font-semibold block">Footer Brand Slogan</label>
                        <input
                          type="text"
                          value={footerTagline}
                          onChange={(e) => setFooterTagline(e.target.value)}
                          className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 12. Footer Link Groups */}
                {['f_link_groups', 'f_links', 'link_groups'].includes(drillDownSection || '') && (
                  <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-4 space-y-4">
                    <div className="flex items-center gap-2.5 pb-3 border-b border-[#2E3548]">
                      <div className="p-2 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 text-[#D4AF37]">
                        <Link className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-white">Footer Link Groups</h3>
                        <p className="text-[11px] text-slate-400">Navigation columns & customer care</p>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      <p className="text-slate-400 text-[11px]">
                        Displays Quick Links, Customer Care, policies, and Flash Sale pages in a 3-column layout.
                      </p>
                    </div>
                  </div>
                )}

                {/* 13. Footer About Us */}
                {['f_about_us', 'f_about', 'about_us'].includes(drillDownSection || '') && (
                  <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-4 space-y-4">
                    <div className="flex items-center gap-2.5 pb-3 border-b border-[#2E3548]">
                      <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-white">About Us</h3>
                        <p className="text-[11px] text-slate-400">Short merchant brand biography</p>
                      </div>
                    </div>

                    <div className="space-y-3 bg-[#131620] p-3 rounded-xl border border-[#2E3548] text-xs">
                      <div className="space-y-1">
                        <label className="text-slate-300 font-semibold block">About Text</label>
                        <textarea
                          rows={3}
                          value={footerAboutText}
                          onChange={(e) => setFooterAboutText(e.target.value)}
                          className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 14. Footer Contact Information */}
                {['f_contact_info', 'f_contact', 'contact_info'].includes(drillDownSection || '') && (
                  <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-4 space-y-4">
                    <div className="flex items-center gap-2.5 pb-3 border-b border-[#2E3548]">
                      <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                        <Phone className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-white">Contact Information</h3>
                        <p className="text-[11px] text-slate-400">Store address, support phone & email</p>
                      </div>
                    </div>

                    <div className="space-y-3 bg-[#131620] p-3 rounded-xl border border-[#2E3548] text-xs">
                      <div className="space-y-1">
                        <label className="text-slate-300 font-semibold block">Store Address</label>
                        <input
                          type="text"
                          value={dhakaAddress}
                          onChange={(e) => setDhakaAddress(e.target.value)}
                          className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-slate-300 font-semibold block">Customer Support Phone</label>
                        <input
                          type="text"
                          value={contactPhone}
                          onChange={(e) => setContactPhone(e.target.value)}
                          className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-slate-300 font-semibold block">Support Email</label>
                        <input
                          type="text"
                          value={contactEmail}
                          onChange={(e) => setContactEmail(e.target.value)}
                          className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                        />
                      </div>
                      <div className="flex items-center justify-between p-2 bg-[#202533] rounded-lg border border-[#2E3548]">
                        <span className="font-semibold text-slate-200">Show bKash / Nagad Badges</span>
                        <input
                          type="checkbox"
                          checked={showPaymentBadges}
                          onChange={(e) => setShowPaymentBadges(e.target.checked)}
                          className="w-4 h-4 accent-[#D4AF37]"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 15. Custom Added Sections */}
                {addedSections.some(s => s.id === drillDownSection) && (
                  <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-4 space-y-4">
                    {addedSections.filter(s => s.id === drillDownSection).map(s => (
                      <div key={s.id} className="space-y-3">
                        <div className="flex items-center justify-between pb-3 border-b border-[#2E3548]">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                              <Layout className="w-4 h-4" />
                            </div>
                            <div>
                              <h3 className="text-sm font-black text-white">{s.name}</h3>
                              <p className="text-[11px] text-slate-400">Custom added section block</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setAddedSections(prev => prev.filter(x => x.id !== s.id));
                              setContentSectionsOrder(prev => prev.filter(x => x.id !== s.id));
                              setDrillDownSection(null);
                            }}
                            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition cursor-pointer"
                            title="Remove section"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="space-y-3 bg-[#131620] p-3 rounded-xl border border-[#2E3548] text-xs">
                          <p className="text-slate-400 text-[11px]">
                            Custom {s.name} block added to storefront layout.
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              </div>
            ) : (
              <div className="space-y-4">

            {/* ---------------- 1. HEADER SECTION ---------------- */}
            <div
              data-drag-group="mainSections"
              data-drag-index={0}
              draggable={true}
              onDragStart={(e) => handleDragStart(e, 'mainSections', 0)}
              onDragOver={(e) => handleDragOver(e, 'mainSections', 0)}
              onDragEnd={handleDragEnd}
              onDrop={(e) => handleDrop(e, 'mainSections', 0)}
              className={`border rounded-2xl bg-[#202533] overflow-hidden transition ${getItemDragStyles('mainSections', 0)}`}
            >
              <div
                onClick={() => setExpandedMainSection(expandedMainSection === 'header' ? null : 'header')}
                className="w-full p-3.5 flex items-center justify-between bg-[#252B3B] hover:bg-[#2E3548] transition cursor-pointer text-left group"
              >
                <div className="flex items-center gap-2">
                  <GripVertical
                    onTouchStart={(e) => handleTouchStart(e, 'mainSections', 0)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchEnd}
                    className="w-4 h-4 text-slate-500 group-hover:text-[#D4AF37] cursor-grab active:cursor-grabbing transition touch-none"
                  />
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); moveItemUp('mainSections', 0); }}
                      disabled={true}
                      className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"
                      title="Move up"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); moveItemDown('mainSections', 0, 3); }}
                      className="p-0.5 text-slate-400 hover:text-white cursor-pointer"
                      title="Move down"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-xs font-bold text-white">1. Header</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAnnouncement(!showAnnouncement);
                      setHasUnsavedChanges(true);
                    }}
                    className="p-1 text-slate-400 hover:text-white cursor-pointer"
                  >
                    {showAnnouncement ? <Eye className="w-3.5 h-3.5 text-[#D4AF37]" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
                  </button>
                  {expandedMainSection === 'header' ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
              </div>

              {expandedMainSection === 'header' && (
                <div className="p-3 space-y-2 border-t border-[#2E3548] text-xs">
                  {headerSectionsOrder.map((hSec, hIdx) => {
                    if (hSec.id === 'settings') {
                      return (
                        /* Sub-item 1.1: Header Settings */
                        <div
                          key="h-settings"
                          data-drag-group="headerSections"
                          data-drag-index={hIdx}
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, 'headerSections', hIdx)}
                          onDragOver={(e) => handleDragOver(e, 'headerSections', hIdx)}
                          onDragEnd={handleDragEnd}
                          onDrop={(e) => handleDrop(e, 'headerSections', hIdx)}
                          className={`bg-[#181B26] border rounded-xl overflow-hidden transition ${
                            dragGroup === 'headerSections' && dragOverIndex === hIdx ? 'border-2 border-[#D4AF37]' : 'border-[#2E3548]'
                          } ${dragGroup === 'headerSections' && draggedIndex === hIdx ? 'opacity-40 border-dashed border-[#D4AF37]' : ''}`}
                        >
                          <div
                            onClick={() => {
                              setActiveHeaderSub('settings');
                              setDrillDownSection('h_settings');
                            }}
                            className="w-full p-3 flex items-center justify-between hover:bg-[#202533] transition cursor-pointer text-left group"
                          >
                            <div className="flex items-center gap-2">
                              <GripVertical
                                onTouchStart={(e) => handleTouchStart(e, 'headerSections', hIdx)}
                                onTouchMove={handleTouchMove}
                                onTouchEnd={handleTouchEnd}
                                onTouchCancel={handleTouchEnd}
                                className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#D4AF37] cursor-grab active:cursor-grabbing transition touch-none"
                              />
                              <div className="flex items-center gap-0.5">
                                <button type="button" onClick={(e) => { e.stopPropagation(); moveItemUp('headerSections', hIdx); }} disabled={hIdx === 0} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronUp className="w-3 h-3" /></button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); moveItemDown('headerSections', hIdx, headerSectionsOrder.length); }} disabled={hIdx === headerSectionsOrder.length - 1} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronDown className="w-3 h-3" /></button>
                              </div>
                              <span className="font-bold text-slate-200">Header Settings</span>
                            </div>
                            <Edit3 className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#D4AF37]" />
                          </div>
                        </div>
                      );
                    }

                    if (hSec.id === 'logo') {
                      return (
                        /* Sub-item 1.2: Logo */
                        <div
                          key="h-logo"
                          data-drag-group="headerSections"
                          data-drag-index={hIdx}
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, 'headerSections', hIdx)}
                          onDragOver={(e) => handleDragOver(e, 'headerSections', hIdx)}
                          onDragEnd={handleDragEnd}
                          onDrop={(e) => handleDrop(e, 'headerSections', hIdx)}
                          className={`bg-[#181B26] border rounded-xl overflow-hidden transition ${
                            dragGroup === 'headerSections' && dragOverIndex === hIdx ? 'border-2 border-[#D4AF37]' : 'border-[#2E3548]'
                          } ${dragGroup === 'headerSections' && draggedIndex === hIdx ? 'opacity-40 border-dashed border-[#D4AF37]' : ''}`}
                        >
                          <div
                            onClick={() => {
                              setActiveHeaderSub('logo');
                              setDrillDownSection('h_logo');
                            }}
                            className="w-full p-3 flex items-center justify-between hover:bg-[#202533] transition cursor-pointer text-left group"
                          >
                            <div className="flex items-center gap-2">
                              <GripVertical
                                onTouchStart={(e) => handleTouchStart(e, 'headerSections', hIdx)}
                                onTouchMove={handleTouchMove}
                                onTouchEnd={handleTouchEnd}
                                onTouchCancel={handleTouchEnd}
                                className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#D4AF37] cursor-grab active:cursor-grabbing transition touch-none"
                              />
                              <div className="flex items-center gap-0.5">
                                <button type="button" onClick={(e) => { e.stopPropagation(); moveItemUp('headerSections', hIdx); }} disabled={hIdx === 0} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronUp className="w-3 h-3" /></button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); moveItemDown('headerSections', hIdx, headerSectionsOrder.length); }} disabled={hIdx === headerSectionsOrder.length - 1} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronDown className="w-3 h-3" /></button>
                              </div>
                              <span className="font-bold text-slate-200">Logo</span>
                            </div>
                            <Edit3 className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#D4AF37]" />
                          </div>
                        </div>
                      );
                    }

                    if (hSec.id === 'announcement') {
                      return (
                        /* Sub-item 1.3: Announcement Bar */
                        <div
                          key="h-announcement"
                          data-drag-group="headerSections"
                          data-drag-index={hIdx}
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, 'headerSections', hIdx)}
                          onDragOver={(e) => handleDragOver(e, 'headerSections', hIdx)}
                          onDragEnd={handleDragEnd}
                          onDrop={(e) => handleDrop(e, 'headerSections', hIdx)}
                          className={`bg-[#181B26] border rounded-xl overflow-hidden transition ${
                            dragGroup === 'headerSections' && dragOverIndex === hIdx ? 'border-2 border-[#D4AF37]' : 'border-[#2E3548]'
                          } ${dragGroup === 'headerSections' && draggedIndex === hIdx ? 'opacity-40 border-dashed border-[#D4AF37]' : ''}`}
                        >
                          <div
                            onClick={() => {
                              setActiveHeaderSub('announcement');
                              setDrillDownSection('h_announcement');
                            }}
                            className="w-full p-3 flex items-center justify-between hover:bg-[#202533] transition cursor-pointer text-left group"
                          >
                            <div className="flex items-center gap-2">
                              <GripVertical
                                onTouchStart={(e) => handleTouchStart(e, 'headerSections', hIdx)}
                                onTouchMove={handleTouchMove}
                                onTouchEnd={handleTouchEnd}
                                onTouchCancel={handleTouchEnd}
                                className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#D4AF37] cursor-grab active:cursor-grabbing transition touch-none"
                              />
                              <div className="flex items-center gap-0.5">
                                <button type="button" onClick={(e) => { e.stopPropagation(); moveItemUp('headerSections', hIdx); }} disabled={hIdx === 0} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronUp className="w-3 h-3" /></button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); moveItemDown('headerSections', hIdx, headerSectionsOrder.length); }} disabled={hIdx === headerSectionsOrder.length - 1} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronDown className="w-3 h-3" /></button>
                              </div>
                              <span className="font-bold text-slate-200">Announcement Bar</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowAnnouncement(!showAnnouncement);
                                }}
                                className="p-1 text-slate-400 hover:text-white"
                              >
                                {showAnnouncement ? <Eye className="w-3.5 h-3.5 text-[#D4AF37]" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
                              </button>
                              <Edit3 className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#D4AF37]" />
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return null;
                  })}

                </div>
              )}
            </div>

            {/* ---------------- 2. PAGE CONTENT SECTION ---------------- */}
            <div
              data-drag-group="mainSections"
              data-drag-index={1}
              draggable={true}
              onDragStart={(e) => handleDragStart(e, 'mainSections', 1)}
              onDragOver={(e) => handleDragOver(e, 'mainSections', 1)}
              onDragEnd={handleDragEnd}
              onDrop={(e) => handleDrop(e, 'mainSections', 1)}
              className={`border rounded-2xl bg-[#202533] overflow-hidden transition ${getItemDragStyles('mainSections', 1)}`}
            >
              <div
                onClick={() => setExpandedMainSection(expandedMainSection === 'content' ? null : 'content')}
                className="w-full p-3.5 flex items-center justify-between bg-[#252B3B] hover:bg-[#2E3548] transition cursor-pointer text-left group"
              >
                <div className="flex items-center gap-2">
                  <GripVertical
                    onTouchStart={(e) => handleTouchStart(e, 'mainSections', 1)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchEnd}
                    className="w-4 h-4 text-slate-500 group-hover:text-[#D4AF37] cursor-grab active:cursor-grabbing transition touch-none"
                  />
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); moveItemUp('mainSections', 1); }}
                      className="p-0.5 text-slate-400 hover:text-white cursor-pointer"
                      title="Move up"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); moveItemDown('mainSections', 1, 3); }}
                      className="p-0.5 text-slate-400 hover:text-white cursor-pointer"
                      title="Move down"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-xs font-bold text-white">2. Page Content</span>
                </div>
                <div className="flex items-center gap-2">
                  {expandedMainSection === 'content' ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
              </div>

              {expandedMainSection === 'content' && (
                <div className="p-3 space-y-2 border-t border-[#2E3548] text-xs">

                  {contentSectionsOrder.map((cSec, cIdx) => {
                    if (cSec.id === 'carousel') {
                      return (
                        /* 2.1: Image Carousel */
                        <div
                          key="c-carousel"
                          data-drag-group="contentSections"
                          data-drag-index={cIdx}
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, 'contentSections', cIdx)}
                          onDragOver={(e) => handleDragOver(e, 'contentSections', cIdx)}
                          onDragEnd={handleDragEnd}
                          onDrop={(e) => handleDrop(e, 'contentSections', cIdx)}
                          className={`bg-[#181B26] border rounded-xl overflow-hidden transition ${
                            dragGroup === 'contentSections' && dragOverIndex === cIdx ? 'border-2 border-[#D4AF37]' : 'border-[#2E3548]'
                          } ${dragGroup === 'contentSections' && draggedIndex === cIdx ? 'opacity-40 border-dashed border-[#D4AF37]' : ''}`}
                        >
                          <div
                            onClick={() => {
                              setDrillDownSection('c_carousel');
                            }}
                            className="w-full p-3 flex items-center justify-between hover:bg-[#202533] transition cursor-pointer text-left group"
                          >
                            <div className="flex items-center gap-2">
                              <GripVertical
                                onTouchStart={(e) => handleTouchStart(e, 'contentSections', cIdx)}
                                onTouchMove={handleTouchMove}
                                onTouchEnd={handleTouchEnd}
                                onTouchCancel={handleTouchEnd}
                                className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#D4AF37] cursor-grab active:cursor-grabbing transition touch-none"
                              />
                              <div className="flex items-center gap-0.5">
                                <button type="button" onClick={(e) => { e.stopPropagation(); moveItemUp('contentSections', cIdx); }} disabled={cIdx === 0} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronUp className="w-3 h-3" /></button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); moveItemDown('contentSections', cIdx, contentSectionsOrder.length); }} disabled={cIdx === contentSectionsOrder.length - 1} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronDown className="w-3 h-3" /></button>
                              </div>
                              <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                              <span className="font-bold text-slate-200">Image Carousel</span>
                            </div>
                            <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowHeroBanner(!showHeroBanner);
                          }}
                          className="p-1 text-slate-400 hover:text-white"
                        >
                          {showHeroBanner ? <Eye className="w-3.5 h-3.5 text-[#D4AF37]" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
                        </button>
                        <Edit3 className="w-3.5 h-3.5 text-slate-400 hover:text-[#D4AF37]" />
                      </div>
                    </div>

                    {activeContentSub === 'carousel' && (
                      <div className="p-3 border-t border-[#2E3548] space-y-3 bg-[#131620]">

                        {/* Transition Type */}
                        <div className="space-y-1.5">
                          <label className="text-slate-300 font-semibold block">Transition Effect</label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setCarouselTransition('slide')}
                              className={`px-3 py-2 rounded-lg text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                                carouselTransition === 'slide'
                                  ? 'bg-[#D4AF37]/10 border-[#D4AF37] text-[#D4AF37]'
                                  : 'bg-[#202533] border-[#2E3548] text-slate-300 hover:bg-[#282E3F]'
                              }`}
                            >
                              <span>Slide Animation</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setCarouselTransition('fade')}
                              className={`px-3 py-2 rounded-lg text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                                carouselTransition === 'fade'
                                  ? 'bg-[#D4AF37]/10 border-[#D4AF37] text-[#D4AF37]'
                                  : 'bg-[#202533] border-[#2E3548] text-slate-300 hover:bg-[#282E3F]'
                              }`}
                            >
                              <span>Fade Effect</span>
                            </button>
                          </div>
                        </div>

                        {/* Height Sliders */}
                        <div className="space-y-2 pt-1">
                          <div className="space-y-1">
                            <div className="flex justify-between text-slate-300 font-semibold text-xs">
                              <span>Desktop Height</span>
                              <span className="text-[#D4AF37] font-mono">{desktopCarouselHeight}px</span>
                            </div>
                            <input
                              type="range"
                              min="250"
                              max="700"
                              value={desktopCarouselHeight}
                              onChange={(e) => setDesktopCarouselHeight(Number(e.target.value))}
                              className="w-full accent-[#D4AF37]"
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-slate-300 font-semibold text-xs">
                              <span>Mobile Height</span>
                              <span className="text-[#D4AF37] font-mono">{mobileCarouselHeight}px</span>
                            </div>
                            <input
                              type="range"
                              min="180"
                              max="500"
                              value={mobileCarouselHeight}
                              onChange={(e) => setMobileCarouselHeight(Number(e.target.value))}
                              className="w-full accent-[#D4AF37]"
                            />
                          </div>
                        </div>

                        {/* Slide Items List */}
                        <div className="space-y-2 pt-1 border-t border-[#2E3548]">
                          <div className="flex items-center justify-between">
                            <label className="text-slate-300 font-semibold block">Slide Items List ({slides.length})</label>
                            <span className="text-[10px] text-slate-400">Click slide to active preview</span>
                          </div>

                          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                            {slides.map((s, idx) => (
                              <div
                                key={s.id}
                                data-drag-group="slides"
                                data-drag-index={idx}
                                draggable={true}
                                onDragStart={(e) => handleDragStart(e, 'slides', idx)}
                                onDragOver={(e) => handleDragOver(e, 'slides', idx)}
                                onDragEnd={handleDragEnd}
                                onDrop={(e) => handleDrop(e, 'slides', idx)}
                                className={`p-2.5 rounded-xl border transition ${
                                  dragGroup === 'slides' && dragOverIndex === idx ? 'border-2 border-[#D4AF37]' : 'border-[#2E3548]'
                                } ${dragGroup === 'slides' && draggedIndex === idx ? 'opacity-40 border-dashed border-[#D4AF37]' : ''} ${activeSlideIndex === idx ? 'bg-[#202533]' : 'bg-[#181B26]'}`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-1.5">
                                    <GripVertical
                                      onTouchStart={(e) => handleTouchStart(e, 'slides', idx)}
                                      onTouchMove={handleTouchMove}
                                      onTouchEnd={handleTouchEnd}
                                      onTouchCancel={handleTouchEnd}
                                      className="w-3.5 h-3.5 text-slate-500 hover:text-[#D4AF37] cursor-grab active:cursor-grabbing touch-none"
                                    />
                                    <div className="flex items-center gap-0.5">
                                      <button type="button" onClick={() => moveItemUp('slides', idx)} disabled={idx === 0} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronUp className="w-3 h-3" /></button>
                                      <button type="button" onClick={() => moveItemDown('slides', idx, slides.length)} disabled={idx === slides.length - 1} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronDown className="w-3 h-3" /></button>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveSlideIndex(idx);
                                        setHeroTitle(s.title);
                                        setHeroSubtitle(s.subtitle);
                                        setHeroCtaText(s.ctaText);
                                        setHeroImage(s.image);
                                      }}
                                      className="flex items-center gap-1.5 text-xs font-bold text-slate-200 hover:text-[#D4AF37] text-left"
                                    >
                                      <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-mono ${activeSlideIndex === idx ? 'bg-[#D4AF37] text-slate-950 font-bold' : 'bg-slate-700 text-slate-300'}`}>
                                        {idx + 1}
                                      </span>
                                      <span className="truncate max-w-[120px]">{s.title || `Slide ${idx + 1}`}</span>
                                    </button>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    {slides.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = slides.filter((_, i) => i !== idx);
                                          setSlides(updated);
                                          if (activeSlideIndex >= updated.length) {
                                            const newActive = Math.max(0, updated.length - 1);
                                            setActiveSlideIndex(newActive);
                                            if (updated[newActive]) {
                                              setHeroTitle(updated[newActive].title);
                                              setHeroSubtitle(updated[newActive].subtitle);
                                              setHeroCtaText(updated[newActive].ctaText);
                                              setHeroImage(updated[newActive].image);
                                            }
                                          }
                                        }}
                                        className="text-red-400 hover:text-red-300 p-1 cursor-pointer"
                                        title="Delete slide"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Slide Editor Fields */}
                                <div className="space-y-2 pt-1 border-t border-[#2E3548]/50">
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-0.5">Title</label>
                                    <input
                                      type="text"
                                      value={s.title}
                                      onChange={(e) => {
                                        const newTitle = e.target.value;
                                        setSlides(prev => prev.map((item, i) => i === idx ? { ...item, title: newTitle } : item));
                                        if (activeSlideIndex === idx) updateHeroTitle(newTitle);
                                      }}
                                      className="w-full bg-[#181B26] border border-[#2E3548] text-white p-1.5 rounded-lg text-xs"
                                    />
                                  </div>

                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-0.5">Subtitle</label>
                                    <textarea
                                      rows={2}
                                      value={s.subtitle}
                                      onChange={(e) => {
                                        const newSub = e.target.value;
                                        setSlides(prev => prev.map((item, i) => i === idx ? { ...item, subtitle: newSub } : item));
                                        if (activeSlideIndex === idx) updateHeroSubtitle(newSub);
                                      }}
                                      className="w-full bg-[#181B26] border border-[#2E3548] text-white p-1.5 rounded-lg text-xs"
                                    />
                                  </div>

                                  <div className="grid grid-cols-2 gap-1.5">
                                    <div>
                                      <label className="text-[10px] text-slate-400 block mb-0.5">CTA Text</label>
                                      <input
                                        type="text"
                                        value={s.ctaText}
                                        onChange={(e) => {
                                          const newCta = e.target.value;
                                          setSlides(prev => prev.map((item, i) => i === idx ? { ...item, ctaText: newCta } : item));
                                          if (activeSlideIndex === idx) { setHeroCtaText(newCta); markDirty(); }
                                        }}
                                        className="w-full bg-[#181B26] border border-[#2E3548] text-white p-1.5 rounded-lg text-xs"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-slate-400 block mb-0.5">CTA Link</label>
                                      <input
                                        type="text"
                                        value={s.ctaLink}
                                        onChange={(e) => {
                                          const newLink = e.target.value;
                                          setSlides(prev => prev.map((item, i) => i === idx ? { ...item, ctaLink: newLink } : item));
                                        }}
                                        className="w-full bg-[#181B26] border border-[#2E3548] text-white p-1.5 rounded-lg text-xs"
                                      />
                                    </div>
                                  </div>

                                  {/* Image URL & Upload */}
                                  <div>
                                    <label className="text-[10px] text-slate-400 block mb-0.5">Slide Image</label>
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        type="text"
                                        placeholder="https://..."
                                        value={s.image}
                                        onChange={(e) => {
                                          const newImg = e.target.value;
                                          setSlides(prev => prev.map((item, i) => i === idx ? { ...item, image: newImg } : item));
                                          if (activeSlideIndex === idx) updateHeroImage(newImg);
                                        }}
                                        className="flex-1 bg-[#181B26] border border-[#2E3548] text-white p-1.5 rounded-lg text-xs"
                                      />
                                      <label className="bg-[#282E3F] hover:bg-[#32394E] border border-[#3A435E] text-slate-200 text-xs font-bold px-2 py-1.5 rounded-lg cursor-pointer shrink-0 flex items-center gap-1 transition">
                                        <Upload className="w-3 h-3 text-[#D4AF37]" />
                                        <input
                                          type="file"
                                          accept="image/*"
                                          className="hidden"
                                          onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                              const reader = new FileReader();
                                              reader.onload = (event) => {
                                                if (event.target?.result) {
                                                  const newImg = event.target.result as string;
                                                  setSlides(prev => prev.map((item, i) => i === idx ? { ...item, image: newImg } : item));
                                                  if (activeSlideIndex === idx) updateHeroImage(newImg);
                                                }
                                              };
                                              reader.readAsDataURL(file);
                                            }
                                          }}
                                        />
                                      </label>
                                    </div>
                                  </div>

                                </div>
                              </div>
                            ))}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const newSlide = {
                                id: `slide-${Date.now()}`,
                                title: `New Campaign Slide ${slides.length + 1}`,
                                subtitle: 'Exclusive discounts and seasonal offers across Bangladesh.',
                                ctaText: 'Shop Now',
                                ctaLink: '/collections/new',
                                image: ''
                              };
                              const updated = [...slides, newSlide];
                              setSlides(updated);
                              setActiveSlideIndex(updated.length - 1);
                              setHeroTitle(newSlide.title);
                              setHeroSubtitle(newSlide.subtitle);
                              setHeroCtaText(newSlide.ctaText);
                              setHeroImage(newSlide.image);
                            }}
                            className="w-full mt-1 bg-[#202533] hover:bg-[#282E3F] border border-dashed border-[#3A435E] hover:border-[#D4AF37] text-slate-200 text-xs font-bold p-2 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5 text-[#D4AF37]" />
                            <span>+ Add Slide</span>
                          </button>
                        </div>

                      </div>
                    )}
                  </div>
                  );
                }

                if (cSec.id === 'categories') {
                  return (
                  /* 2.2: Categories */
                  <div
                    key="c-categories"
                    data-drag-group="contentSections"
                    data-drag-index={cIdx}
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, 'contentSections', cIdx)}
                    onDragOver={(e) => handleDragOver(e, 'contentSections', cIdx)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, 'contentSections', cIdx)}
                    className={`bg-[#181B26] border rounded-xl overflow-hidden transition ${
                      dragGroup === 'contentSections' && dragOverIndex === cIdx ? 'border-2 border-[#D4AF37]' : 'border-[#2E3548]'
                    } ${dragGroup === 'contentSections' && draggedIndex === cIdx ? 'opacity-40 border-dashed border-[#D4AF37]' : ''}`}
                  >
                    <div
                      onClick={() => {
                        setDrillDownSection('c_categories');
                      }}
                      className="w-full p-3 flex items-center justify-between hover:bg-[#202533] transition cursor-pointer text-left group"
                    >
                      <div className="flex items-center gap-2">
                        <GripVertical
                          onTouchStart={(e) => handleTouchStart(e, 'contentSections', cIdx)}
                          onTouchMove={handleTouchMove}
                          onTouchEnd={handleTouchEnd}
                          onTouchCancel={handleTouchEnd}
                          className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#D4AF37] cursor-grab active:cursor-grabbing transition touch-none"
                        />
                        <div className="flex items-center gap-0.5">
                          <button type="button" onClick={(e) => { e.stopPropagation(); moveItemUp('contentSections', cIdx); }} disabled={cIdx === 0} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronUp className="w-3 h-3" /></button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); moveItemDown('contentSections', cIdx, contentSectionsOrder.length); }} disabled={cIdx === contentSectionsOrder.length - 1} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronDown className="w-3 h-3" /></button>
                        </div>
                        <Grid className="w-3.5 h-3.5 text-amber-400" />
                        <span className="font-bold text-slate-200">Categories</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowCategories(!showCategories);
                          }}
                          className="p-1 text-slate-400 hover:text-white"
                        >
                          {showCategories ? <Eye className="w-3.5 h-3.5 text-[#D4AF37]" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
                        </button>
                        <Edit3 className="w-3.5 h-3.5 text-slate-400 hover:text-[#D4AF37]" />
                      </div>
                    </div>

                    {activeContentSub === 'categories' && (
                      <div className="p-3 border-t border-[#2E3548] space-y-3 bg-[#131620]">
                        <div className="space-y-1">
                          <label className="text-slate-300 font-semibold block">Section Heading</label>
                          <input
                            type="text"
                            value={categoriesHeading}
                            onChange={(e) => setCategoriesHeading(e.target.value)}
                            className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                          />
                        </div>

                        {/* Background Image Upload */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center">
                            <label className="text-slate-300 font-semibold block">Section Background Image</label>
                            {categoriesBgImage && (
                              <button
                                type="button"
                                onClick={() => setCategoriesBgImage('')}
                                className="text-red-400 hover:text-red-300 text-[10px] font-bold cursor-pointer"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              placeholder="Background Image URL or upload..."
                              value={categoriesBgImage}
                              onChange={(e) => setCategoriesBgImage(e.target.value)}
                              className="flex-1 bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                            />
                            <label className="bg-[#282E3F] hover:bg-[#32394E] border border-[#3A435E] text-slate-200 text-xs font-bold px-2.5 py-2 rounded-lg cursor-pointer shrink-0 flex items-center gap-1 transition">
                              <Upload className="w-3.5 h-3.5 text-[#D4AF37]" />
                              <span>Upload</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (event) => {
                                      if (event.target?.result) {
                                        setCategoriesBgImage(event.target.result as string);
                                      }
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                            </label>
                          </div>
                        </div>

                        {/* Overlay Opacity Slider */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-slate-300 font-semibold text-xs">
                            <span>Overlay Opacity</span>
                            <span className="text-[#D4AF37] font-mono">{categoriesOverlayOpacity}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={categoriesOverlayOpacity}
                            onChange={(e) => setCategoriesOverlayOpacity(Number(e.target.value))}
                            className="w-full accent-[#D4AF37]"
                          />
                        </div>

                        <div className="text-slate-400 text-[11px] pt-1 border-t border-[#2E3548]/60">
                          Includes 4 active collections (Sarees, Panjabi, Footwear, Gadgets).
                        </div>
                      </div>
                    )}
                  </div>
                  );
                }

                if (cSec.id === 'products') {
                  return (
                  /* 2.3: Products */
                  <div
                    key="c-products"
                    data-drag-group="contentSections"
                    data-drag-index={cIdx}
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, 'contentSections', cIdx)}
                    onDragOver={(e) => handleDragOver(e, 'contentSections', cIdx)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, 'contentSections', cIdx)}
                    className={`bg-[#181B26] border rounded-xl overflow-hidden transition ${
                      dragGroup === 'contentSections' && dragOverIndex === cIdx ? 'border-2 border-[#D4AF37]' : 'border-[#2E3548]'
                    } ${dragGroup === 'contentSections' && draggedIndex === cIdx ? 'opacity-40 border-dashed border-[#D4AF37]' : ''}`}
                  >
                    <div
                      onClick={() => {
                        setDrillDownSection('c_products');
                      }}
                      className="w-full p-3 flex items-center justify-between hover:bg-[#202533] transition cursor-pointer text-left group"
                    >
                      <div className="flex items-center gap-2">
                        <GripVertical
                          onTouchStart={(e) => handleTouchStart(e, 'contentSections', cIdx)}
                          onTouchMove={handleTouchMove}
                          onTouchEnd={handleTouchEnd}
                          onTouchCancel={handleTouchEnd}
                          className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#D4AF37] cursor-grab active:cursor-grabbing transition touch-none"
                        />
                        <div className="flex items-center gap-0.5">
                          <button type="button" onClick={(e) => { e.stopPropagation(); moveItemUp('contentSections', cIdx); }} disabled={cIdx === 0} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronUp className="w-3 h-3" /></button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); moveItemDown('contentSections', cIdx, contentSectionsOrder.length); }} disabled={cIdx === contentSectionsOrder.length - 1} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronDown className="w-3 h-3" /></button>
                        </div>
                        <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="font-bold text-slate-200">Products</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowFeaturedGrid(!showFeaturedGrid);
                          }}
                          className="p-1 text-slate-400 hover:text-white"
                        >
                          {showFeaturedGrid ? <Eye className="w-3.5 h-3.5 text-[#D4AF37]" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
                        </button>
                        <Edit3 className="w-3.5 h-3.5 text-slate-400 hover:text-[#D4AF37]" />
                      </div>
                    </div>

                    {activeContentSub === 'products' && (
                      <div className="p-3 border-t border-[#2E3548] space-y-2.5 bg-[#131620]">
                        <div className="space-y-1">
                          <label className="text-slate-300 font-semibold block">Grid Section Title</label>
                          <input
                            type="text"
                            value={featuredHeading}
                            onChange={(e) => setFeaturedHeading(e.target.value)}
                            className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-slate-300 font-semibold block">Columns Layout</label>
                          <select
                            value={productColumns}
                            onChange={(e) => setProductColumns(Number(e.target.value))}
                            className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                          >
                            <option value={2}>2 Columns</option>
                            <option value={3}>3 Columns</option>
                            <option value={4}>4 Columns</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                  );
                }

                if (cSec.id === 'countdown') {
                  return (
                  /* 2.4: Countdown Timer */
                  <div
                    key="c-countdown"
                    data-drag-group="contentSections"
                    data-drag-index={cIdx}
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, 'contentSections', cIdx)}
                    onDragOver={(e) => handleDragOver(e, 'contentSections', cIdx)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, 'contentSections', cIdx)}
                    className={`bg-[#181B26] border rounded-xl overflow-hidden transition ${
                      dragGroup === 'contentSections' && dragOverIndex === cIdx ? 'border-2 border-[#D4AF37]' : 'border-[#2E3548]'
                    } ${dragGroup === 'contentSections' && draggedIndex === cIdx ? 'opacity-40 border-dashed border-[#D4AF37]' : ''}`}
                  >
                    <div
                      onClick={() => {
                        setDrillDownSection('c_countdown');
                      }}
                      className="w-full p-3 flex items-center justify-between hover:bg-[#202533] transition cursor-pointer text-left group"
                    >
                      <div className="flex items-center gap-2">
                        <GripVertical
                          onTouchStart={(e) => handleTouchStart(e, 'contentSections', cIdx)}
                          onTouchMove={handleTouchMove}
                          onTouchEnd={handleTouchEnd}
                          onTouchCancel={handleTouchEnd}
                          className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#D4AF37] cursor-grab active:cursor-grabbing transition touch-none"
                        />
                        <div className="flex items-center gap-0.5">
                          <button type="button" onClick={(e) => { e.stopPropagation(); moveItemUp('contentSections', cIdx); }} disabled={cIdx === 0} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronUp className="w-3 h-3" /></button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); moveItemDown('contentSections', cIdx, contentSectionsOrder.length); }} disabled={cIdx === contentSectionsOrder.length - 1} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronDown className="w-3 h-3" /></button>
                        </div>
                        <Clock className="w-3.5 h-3.5 text-red-400" />
                        <span className="font-bold text-slate-200">Countdown Timer</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowCountdown(!showCountdown);
                          }}
                          className="p-1 text-slate-400 hover:text-white"
                        >
                          {showCountdown ? <Eye className="w-3.5 h-3.5 text-[#D4AF37]" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
                        </button>
                        <Edit3 className="w-3.5 h-3.5 text-slate-400 hover:text-[#D4AF37]" />
                      </div>
                    </div>

                    {activeContentSub === 'countdown' && (
                      <div className="p-3 border-t border-[#2E3548] space-y-3 bg-[#131620]">
                        <div className="space-y-1">
                          <label className="text-slate-300 font-semibold block">Timer Header Title</label>
                          <input
                            type="text"
                            value={countdownTitle}
                            onChange={(e) => setCountdownTitle(e.target.value)}
                            className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-slate-300 font-semibold block">Special Discount Code Text</label>
                          <input
                            type="text"
                            value={countdownDiscount}
                            onChange={(e) => setCountdownDiscount(e.target.value)}
                            className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                          />
                        </div>

                        {/* End Date Picker */}
                        <div className="space-y-1">
                          <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-red-400" />
                            <span>End Date & Time Picker</span>
                          </label>
                          <input
                            type="datetime-local"
                            value={countdownEndDate}
                            onChange={(e) => setCountdownEndDate(e.target.value)}
                            className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs [color-scheme:dark]"
                          />
                        </div>

                        {/* Background Image Upload */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center">
                            <label className="text-slate-300 font-semibold block">Background Image Uploader</label>
                            {countdownBgImage && (
                              <button
                                type="button"
                                onClick={() => setCountdownBgImage('')}
                                className="text-red-400 hover:text-red-300 text-[10px] font-bold cursor-pointer"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              placeholder="Background image URL..."
                              value={countdownBgImage}
                              onChange={(e) => setCountdownBgImage(e.target.value)}
                              className="flex-1 bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                            />
                            <label className="bg-[#282E3F] hover:bg-[#32394E] border border-[#3A435E] text-slate-200 text-xs font-bold px-2.5 py-2 rounded-lg cursor-pointer shrink-0 flex items-center gap-1 transition">
                              <Upload className="w-3.5 h-3.5 text-[#D4AF37]" />
                              <span>Upload</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (event) => {
                                      if (event.target?.result) {
                                        setCountdownBgImage(event.target.result as string);
                                      }
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                            </label>
                          </div>
                        </div>

                        {/* Overlay Opacity Slider */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-slate-300 font-semibold text-xs">
                            <span>Overlay Opacity</span>
                            <span className="text-[#D4AF37] font-mono">{countdownOverlayOpacity}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={countdownOverlayOpacity}
                            onChange={(e) => setCountdownOverlayOpacity(Number(e.target.value))}
                            className="w-full accent-red-400"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-slate-400 text-[11px]">
                            <span>Simulated Hours Remaining</span>
                            <span>{countdownHours} hrs</span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="72"
                            value={countdownHours}
                            onChange={(e) => setCountdownHours(Number(e.target.value))}
                            className="w-full accent-red-400"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  );
                }

                if (cSec.id === 'gallery') {
                  return (
                  /* 2.5: Gallery */
                  <div
                    key="c-gallery"
                    data-drag-group="contentSections"
                    data-drag-index={cIdx}
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, 'contentSections', cIdx)}
                    onDragOver={(e) => handleDragOver(e, 'contentSections', cIdx)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, 'contentSections', cIdx)}
                    className={`bg-[#181B26] border rounded-xl overflow-hidden transition ${
                      dragGroup === 'contentSections' && dragOverIndex === cIdx ? 'border-2 border-[#D4AF37]' : 'border-[#2E3548]'
                    } ${dragGroup === 'contentSections' && draggedIndex === cIdx ? 'opacity-40 border-dashed border-[#D4AF37]' : ''}`}
                  >
                    <div
                      onClick={() => {
                        setDrillDownSection('c_gallery');
                      }}
                      className="w-full p-3 flex items-center justify-between hover:bg-[#202533] transition cursor-pointer text-left group"
                    >
                      <div className="flex items-center gap-2">
                        <GripVertical
                          onTouchStart={(e) => handleTouchStart(e, 'contentSections', cIdx)}
                          onTouchMove={handleTouchMove}
                          onTouchEnd={handleTouchEnd}
                          onTouchCancel={handleTouchEnd}
                          className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#D4AF37] cursor-grab active:cursor-grabbing transition touch-none"
                        />
                        <div className="flex items-center gap-0.5">
                          <button type="button" onClick={(e) => { e.stopPropagation(); moveItemUp('contentSections', cIdx); }} disabled={cIdx === 0} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronUp className="w-3 h-3" /></button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); moveItemDown('contentSections', cIdx, contentSectionsOrder.length); }} disabled={cIdx === contentSectionsOrder.length - 1} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronDown className="w-3 h-3" /></button>
                        </div>
                        <Maximize className="w-3.5 h-3.5 text-purple-400" />
                        <span className="font-bold text-slate-200">Gallery</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowGallery(!showGallery);
                          }}
                          className="p-1 text-slate-400 hover:text-white"
                        >
                          {showGallery ? <Eye className="w-3.5 h-3.5 text-[#D4AF37]" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
                        </button>
                        <Edit3 className="w-3.5 h-3.5 text-slate-400 hover:text-[#D4AF37]" />
                      </div>
                    </div>

                    {activeContentSub === 'gallery' && (
                      <div className="p-3 border-t border-[#2E3548] space-y-2.5 bg-[#131620]">
                        <div className="space-y-1">
                          <label className="text-slate-300 font-semibold block">Gallery Section Heading</label>
                          <input
                            type="text"
                            value={galleryHeading}
                            onChange={(e) => setGalleryHeading(e.target.value)}
                            className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                          />
                        </div>
                        <p className="text-slate-400 text-[11px]">Grid displaying 4 high-definition artisan photography items.</p>
                      </div>
                    )}
                  </div>
                  );
                }

                if (cSec.id === 'brand_social') {
                  return (
                  /* 2.6: Logo & Social Media */
                  <div
                    key="c-brand_social"
                    data-drag-group="contentSections"
                    data-drag-index={cIdx}
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, 'contentSections', cIdx)}
                    onDragOver={(e) => handleDragOver(e, 'contentSections', cIdx)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, 'contentSections', cIdx)}
                    className={`bg-[#181B26] border rounded-xl overflow-hidden transition ${
                      dragGroup === 'contentSections' && dragOverIndex === cIdx ? 'border-2 border-[#D4AF37]' : 'border-[#2E3548]'
                    } ${dragGroup === 'contentSections' && draggedIndex === cIdx ? 'opacity-40 border-dashed border-[#D4AF37]' : ''}`}
                  >
                    <div
                      onClick={() => {
                        setDrillDownSection('c_brand_social');
                      }}
                      className="w-full p-3 flex items-center justify-between hover:bg-[#202533] transition cursor-pointer text-left group"
                    >
                      <div className="flex items-center gap-2">
                        <GripVertical
                          onTouchStart={(e) => handleTouchStart(e, 'contentSections', cIdx)}
                          onTouchMove={handleTouchMove}
                          onTouchEnd={handleTouchEnd}
                          onTouchCancel={handleTouchEnd}
                          className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#D4AF37] cursor-grab active:cursor-grabbing transition touch-none"
                        />
                        <div className="flex items-center gap-0.5">
                          <button type="button" onClick={(e) => { e.stopPropagation(); moveItemUp('contentSections', cIdx); }} disabled={cIdx === 0} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronUp className="w-3 h-3" /></button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); moveItemDown('contentSections', cIdx, contentSectionsOrder.length); }} disabled={cIdx === contentSectionsOrder.length - 1} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronDown className="w-3 h-3" /></button>
                        </div>
                        <Share2 className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="font-bold text-slate-200">Logo & Social Media</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowSocialBlock(!showSocialBlock);
                          }}
                          className="p-1 text-[#D4AF37] hover:text-white"
                        >
                          {showSocialBlock ? <Eye className="w-3.5 h-3.5 text-[#D4AF37]" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
                        </button>
                        <Edit3 className="w-3.5 h-3.5 text-slate-400 hover:text-[#D4AF37]" />
                      </div>
                    </div>

                    {activeContentSub === 'brand_social' && (
                      <div className="p-3 border-t border-[#2E3548] space-y-2.5 bg-[#131620]">
                        <div className="space-y-1">
                          <label className="text-slate-300 font-semibold block">Social Tagline</label>
                          <input
                            type="text"
                            value={socialTagline}
                            onChange={(e) => setSocialTagline(e.target.value)}
                            className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-slate-300 font-semibold block">Facebook URL</label>
                          <input
                            type="text"
                            value={facebookHandle}
                            onChange={(e) => setFacebookHandle(e.target.value)}
                            className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-slate-300 font-semibold block">Instagram Handle</label>
                          <input
                            type="text"
                            value={instagramHandle}
                            onChange={(e) => setInstagramHandle(e.target.value)}
                            className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-slate-300 font-semibold block">WhatsApp Support</label>
                          <input
                            type="text"
                            value={whatsappNumber}
                            onChange={(e) => setWhatsappNumber(e.target.value)}
                            className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  );
                }

                if (cSec.id === 'video') {
                  return (
                  /* 2.7: Video */
                  <div
                    key="c-video"
                    data-drag-group="contentSections"
                    data-drag-index={cIdx}
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, 'contentSections', cIdx)}
                    onDragOver={(e) => handleDragOver(e, 'contentSections', cIdx)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, 'contentSections', cIdx)}
                    className={`bg-[#181B26] border rounded-xl overflow-hidden transition ${
                      dragGroup === 'contentSections' && dragOverIndex === cIdx ? 'border-2 border-[#D4AF37]' : 'border-[#2E3548]'
                    } ${dragGroup === 'contentSections' && draggedIndex === cIdx ? 'opacity-40 border-dashed border-[#D4AF37]' : ''}`}
                  >
                    <div
                      onClick={() => {
                        setDrillDownSection('c_video');
                      }}
                      className="w-full p-3 flex items-center justify-between hover:bg-[#202533] transition cursor-pointer text-left group"
                    >
                      <div className="flex items-center gap-2">
                        <GripVertical
                          onTouchStart={(e) => handleTouchStart(e, 'contentSections', cIdx)}
                          onTouchMove={handleTouchMove}
                          onTouchEnd={handleTouchEnd}
                          onTouchCancel={handleTouchEnd}
                          className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#D4AF37] cursor-grab active:cursor-grabbing transition touch-none"
                        />
                        <div className="flex items-center gap-0.5">
                          <button type="button" onClick={(e) => { e.stopPropagation(); moveItemUp('contentSections', cIdx); }} disabled={cIdx === 0} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronUp className="w-3 h-3" /></button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); moveItemDown('contentSections', cIdx, contentSectionsOrder.length); }} disabled={cIdx === contentSectionsOrder.length - 1} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronDown className="w-3 h-3" /></button>
                        </div>
                        <Video className="w-3.5 h-3.5 text-pink-400" />
                        <span className="font-bold text-slate-200">Video</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowVideo(!showVideo);
                          }}
                          className="p-1 text-slate-400 hover:text-white"
                        >
                          {showVideo ? <Eye className="w-3.5 h-3.5 text-[#D4AF37]" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
                        </button>
                        <Edit3 className="w-3.5 h-3.5 text-slate-400 hover:text-[#D4AF37]" />
                      </div>
                    </div>

                    {activeContentSub === 'video' && (
                      <div className="p-3 border-t border-[#2E3548] space-y-3 bg-[#131620]">
                        <div className="space-y-1">
                          <label className="text-slate-300 font-semibold block">Video Title</label>
                          <input
                            type="text"
                            value={videoTitle}
                            onChange={(e) => setVideoTitle(e.target.value)}
                            className="w-full bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                          />
                        </div>

                        {/* Cover Image Uploader */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center">
                            <label className="text-slate-300 font-semibold block">Cover Image Uploader</label>
                            {videoCoverImage && (
                              <button
                                type="button"
                                onClick={() => setVideoCoverImage('')}
                                className="text-red-400 hover:text-red-300 text-[10px] font-bold cursor-pointer"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          {videoCoverImage && (
                            <div className="flex items-center gap-2 p-1.5 bg-[#202533] border border-[#2E3548] rounded-lg">
                              <img src={videoCoverImage} alt="Cover Preview" className="h-8 w-14 object-cover rounded bg-slate-900" />
                              <span className="text-[11px] text-slate-300 truncate flex-1">Cover Thumbnail</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              placeholder="Cover image URL..."
                              value={videoCoverImage}
                              onChange={(e) => setVideoCoverImage(e.target.value)}
                              className="flex-1 bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                            />
                            <label className="bg-[#282E3F] hover:bg-[#32394E] border border-[#3A435E] text-slate-200 text-xs font-bold px-2.5 py-2 rounded-lg cursor-pointer shrink-0 flex items-center gap-1 transition">
                              <Upload className="w-3.5 h-3.5 text-[#D4AF37]" />
                              <span>Upload</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (event) => {
                                      if (event.target?.result) {
                                        setVideoCoverImage(event.target.result as string);
                                      }
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                            </label>
                          </div>
                        </div>

                        {/* Video File Uploader / Video URL */}
                        <div className="space-y-1.5">
                          <label className="text-slate-300 font-semibold block">Video File Uploader / URL</label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              placeholder="Video file or YouTube URL..."
                              value={videoFileUrl || videoUrl}
                              onChange={(e) => {
                                setVideoUrl(e.target.value);
                                setVideoFileUrl(e.target.value);
                              }}
                              className="flex-1 bg-[#202533] border border-[#2E3548] text-white p-2 rounded-lg text-xs"
                            />
                            <label className="bg-[#282E3F] hover:bg-[#32394E] border border-[#3A435E] text-slate-200 text-xs font-bold px-2.5 py-2 rounded-lg cursor-pointer shrink-0 flex items-center gap-1 transition">
                              <Film className="w-3.5 h-3.5 text-pink-400" />
                              <span>Upload</span>
                              <input
                                type="file"
                                accept="video/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (event) => {
                                      if (event.target?.result) {
                                        setVideoFileUrl(event.target.result as string);
                                      }
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                            </label>
                          </div>
                          {videoFileUrl && videoFileUrl.startsWith('data:video') && (
                            <span className="text-[10px] text-[#D4AF37] font-mono block">✓ Custom video file uploaded</span>
                          )}
                        </div>

                        {/* Autoplay Checkbox */}
                        <div className="flex items-center justify-between pt-1">
                          <label className="text-slate-300 font-semibold cursor-pointer select-none flex items-center gap-1.5">
                            <span>Autoplay Video</span>
                            <span className="text-[10px] text-slate-400 font-normal">(Muted)</span>
                          </label>
                          <input
                            type="checkbox"
                            checked={videoAutoplay}
                            onChange={(e) => setVideoAutoplay(e.target.checked)}
                            className="w-4 h-4 accent-pink-500 cursor-pointer"
                          />
                        </div>

                      </div>
                    )}
                  </div>
                  );
                }

                return null;
              })}

                  {/* Render Custom Added Sections */}
                  {addedSections.map((sec, idx) => (
                    <div
                      key={sec.id}
                      data-drag-group="addedSections"
                      data-drag-index={idx}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, 'addedSections', idx)}
                      onDragOver={(e) => handleDragOver(e, 'addedSections', idx)}
                      onDragEnd={handleDragEnd}
                      onDrop={(e) => handleDrop(e, 'addedSections', idx)}
                      className={`bg-[#181B26] border p-3 rounded-xl flex items-center justify-between text-slate-200 transition ${
                        dragGroup === 'addedSections' && dragOverIndex === idx ? 'border-2 border-[#D4AF37]' : 'border-[#2E3548]'
                      } ${dragGroup === 'addedSections' && draggedIndex === idx ? 'opacity-40 border-dashed border-[#D4AF37]' : ''}`}
                    >
                      <div className="flex items-center gap-2 font-bold">
                        <GripVertical
                          onTouchStart={(e) => handleTouchStart(e, 'addedSections', idx)}
                          onTouchMove={handleTouchMove}
                          onTouchEnd={handleTouchEnd}
                          onTouchCancel={handleTouchEnd}
                          className="w-3.5 h-3.5 text-slate-500 hover:text-[#D4AF37] cursor-grab active:cursor-grabbing touch-none shrink-0"
                        />
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button type="button" onClick={() => moveItemUp('addedSections', idx)} disabled={idx === 0} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronUp className="w-3 h-3" /></button>
                          <button type="button" onClick={() => moveItemDown('addedSections', idx, addedSections.length)} disabled={idx === addedSections.length - 1} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronDown className="w-3 h-3" /></button>
                        </div>
                        <span>{sec.name}</span>
                      </div>
                      <button
                        onClick={() => setAddedSections((prev) => prev.filter((item) => item.id !== sec.id))}
                        className="text-red-400 hover:text-red-300 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {/* 2.8: "+ Add section" Button */}
                  <button
                    onClick={() => setShowAddSectionModal(true)}
                    className="w-full mt-2 bg-[#202533] hover:bg-[#282E3F] border border-dashed border-[#3A435E] hover:border-[#D4AF37] text-slate-300 hover:text-white text-xs font-bold p-3 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-[#D4AF37]" />
                    <span>+ Add section</span>
                  </button>

                </div>
              )}
            </div>

            {/* ---------------- 3. FOOTER SECTION ---------------- */}
            <div
              data-drag-group="mainSections"
              data-drag-index={2}
              draggable={true}
              onDragStart={(e) => handleDragStart(e, 'mainSections', 2)}
              onDragOver={(e) => handleDragOver(e, 'mainSections', 2)}
              onDragEnd={handleDragEnd}
              onDrop={(e) => handleDrop(e, 'mainSections', 2)}
              className={`border rounded-2xl bg-[#202533] overflow-hidden transition ${getItemDragStyles('mainSections', 2)}`}
            >
              <div
                onClick={() => setExpandedMainSection(expandedMainSection === 'footer' ? null : 'footer')}
                className="w-full p-3.5 flex items-center justify-between bg-[#252B3B] hover:bg-[#2E3548] transition cursor-pointer text-left group"
              >
                <div className="flex items-center gap-2">
                  <GripVertical
                    onTouchStart={(e) => handleTouchStart(e, 'mainSections', 2)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchEnd}
                    className="w-4 h-4 text-slate-500 group-hover:text-[#D4AF37] cursor-grab active:cursor-grabbing transition touch-none"
                  />
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); moveItemUp('mainSections', 2); }}
                      className="p-0.5 text-slate-400 hover:text-white cursor-pointer"
                      title="Move up"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); moveItemDown('mainSections', 2, 3); }}
                      disabled={true}
                      className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"
                      title="Move down"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-xs font-bold text-white">3. Footer</span>
                </div>
                <div className="flex items-center gap-2">
                  {expandedMainSection === 'footer' ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
              </div>

              {expandedMainSection === 'footer' && (
                <div className="p-3 space-y-2 border-t border-[#2E3548] text-xs">
                  {footerSectionsOrder.map((fSec, fIdx) => {
                    if (fSec.id === 'logo') {
                      return (
                        /* 3.1 Footer Logo */
                        <div
                          key="f-logo"
                          data-drag-group="footerSections"
                          data-drag-index={fIdx}
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, 'footerSections', fIdx)}
                          onDragOver={(e) => handleDragOver(e, 'footerSections', fIdx)}
                          onDragEnd={handleDragEnd}
                          onDrop={(e) => handleDrop(e, 'footerSections', fIdx)}
                          className={`bg-[#181B26] border rounded-xl overflow-hidden transition ${
                            dragGroup === 'footerSections' && dragOverIndex === fIdx ? 'border-2 border-[#D4AF37]' : 'border-[#2E3548]'
                          } ${dragGroup === 'footerSections' && draggedIndex === fIdx ? 'opacity-40 border-dashed border-[#D4AF37]' : ''}`}
                        >
                          <div
                            onClick={() => {
                              setActiveFooterSub('logo');
                              setDrillDownSection('f_logo');
                            }}
                            className="w-full p-3 flex items-center justify-between hover:bg-[#202533] transition cursor-pointer text-left group"
                          >
                            <div className="flex items-center gap-2">
                              <GripVertical
                                onTouchStart={(e) => handleTouchStart(e, 'footerSections', fIdx)}
                                onTouchMove={handleTouchMove}
                                onTouchEnd={handleTouchEnd}
                                onTouchCancel={handleTouchEnd}
                                className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#D4AF37] cursor-grab active:cursor-grabbing transition touch-none"
                              />
                              <div className="flex items-center gap-0.5">
                                <button type="button" onClick={(e) => { e.stopPropagation(); moveItemUp('footerSections', fIdx); }} disabled={fIdx === 0} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronUp className="w-3 h-3" /></button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); moveItemDown('footerSections', fIdx, footerSectionsOrder.length); }} disabled={fIdx === footerSectionsOrder.length - 1} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronDown className="w-3 h-3" /></button>
                              </div>
                              <span className="font-bold text-slate-200">Logo</span>
                            </div>
                            <Edit3 className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#D4AF37]" />
                          </div>
                        </div>
                      );
                    }

                if (fSec.id === 'link_groups') {
                  return (
                  /* 3.2 Link Groups */
                  <div
                    key="f-link_groups"
                    data-drag-group="footerSections"
                    data-drag-index={fIdx}
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, 'footerSections', fIdx)}
                    onDragOver={(e) => handleDragOver(e, 'footerSections', fIdx)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, 'footerSections', fIdx)}
                    className={`bg-[#181B26] border rounded-xl overflow-hidden transition ${
                      dragGroup === 'footerSections' && dragOverIndex === fIdx ? 'border-2 border-[#D4AF37]' : 'border-[#2E3548]'
                    } ${dragGroup === 'footerSections' && draggedIndex === fIdx ? 'opacity-40 border-dashed border-[#D4AF37]' : ''}`}
                  >
                    <div
                      onClick={() => {
                        setActiveFooterSub('link_groups');
                        setDrillDownSection('f_links');
                      }}
                      className="w-full p-3 flex items-center justify-between hover:bg-[#202533] transition cursor-pointer text-left group"
                    >
                      <div className="flex items-center gap-2">
                        <GripVertical
                          onTouchStart={(e) => handleTouchStart(e, 'footerSections', fIdx)}
                          onTouchMove={handleTouchMove}
                          onTouchEnd={handleTouchEnd}
                          onTouchCancel={handleTouchEnd}
                          className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#D4AF37] cursor-grab active:cursor-grabbing transition touch-none"
                        />
                        <div className="flex items-center gap-0.5">
                          <button type="button" onClick={(e) => { e.stopPropagation(); moveItemUp('footerSections', fIdx); }} disabled={fIdx === 0} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronUp className="w-3 h-3" /></button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); moveItemDown('footerSections', fIdx, footerSectionsOrder.length); }} disabled={fIdx === footerSectionsOrder.length - 1} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronDown className="w-3 h-3" /></button>
                        </div>
                        <span className="font-bold text-slate-200">Link Groups</span>
                      </div>
                      <Edit3 className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#D4AF37]" />
                    </div>
                  </div>
                );
              }

                    if (fSec.id === 'about_us') {
                      return (
                        /* 3.3 About Us */
                        <div
                          key="f-about_us"
                          data-drag-group="footerSections"
                          data-drag-index={fIdx}
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, 'footerSections', fIdx)}
                          onDragOver={(e) => handleDragOver(e, 'footerSections', fIdx)}
                          onDragEnd={handleDragEnd}
                          onDrop={(e) => handleDrop(e, 'footerSections', fIdx)}
                          className={`bg-[#181B26] border rounded-xl overflow-hidden transition ${
                            dragGroup === 'footerSections' && dragOverIndex === fIdx ? 'border-2 border-[#D4AF37]' : 'border-[#2E3548]'
                          } ${dragGroup === 'footerSections' && draggedIndex === fIdx ? 'opacity-40 border-dashed border-[#D4AF37]' : ''}`}
                        >
                          <div
                            onClick={() => {
                              setActiveFooterSub('about_us');
                              setDrillDownSection('f_about');
                            }}
                            className="w-full p-3 flex items-center justify-between hover:bg-[#202533] transition cursor-pointer text-left group"
                          >
                            <div className="flex items-center gap-2">
                              <GripVertical
                                onTouchStart={(e) => handleTouchStart(e, 'footerSections', fIdx)}
                                onTouchMove={handleTouchMove}
                                onTouchEnd={handleTouchEnd}
                                onTouchCancel={handleTouchEnd}
                                className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#D4AF37] cursor-grab active:cursor-grabbing transition touch-none"
                              />
                              <div className="flex items-center gap-0.5">
                                <button type="button" onClick={(e) => { e.stopPropagation(); moveItemUp('footerSections', fIdx); }} disabled={fIdx === 0} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronUp className="w-3 h-3" /></button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); moveItemDown('footerSections', fIdx, footerSectionsOrder.length); }} disabled={fIdx === footerSectionsOrder.length - 1} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronDown className="w-3 h-3" /></button>
                              </div>
                              <span className="font-bold text-slate-200">About Us</span>
                            </div>
                            <Edit3 className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#D4AF37]" />
                          </div>
                        </div>
                      );
                    }

                    if (fSec.id === 'contact_info') {
                      return (
                        /* 3.4 Contact Information */
                        <div
                          key="f-contact_info"
                          data-drag-group="footerSections"
                          data-drag-index={fIdx}
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, 'footerSections', fIdx)}
                          onDragOver={(e) => handleDragOver(e, 'footerSections', fIdx)}
                          onDragEnd={handleDragEnd}
                          onDrop={(e) => handleDrop(e, 'footerSections', fIdx)}
                          className={`bg-[#181B26] border rounded-xl overflow-hidden transition ${
                            dragGroup === 'footerSections' && dragOverIndex === fIdx ? 'border-2 border-[#D4AF37]' : 'border-[#2E3548]'
                          } ${dragGroup === 'footerSections' && draggedIndex === fIdx ? 'opacity-40 border-dashed border-[#D4AF37]' : ''}`}
                        >
                          <div
                            onClick={() => {
                              setActiveFooterSub('contact_info');
                              setDrillDownSection('f_contact');
                            }}
                            className="w-full p-3 flex items-center justify-between hover:bg-[#202533] transition cursor-pointer text-left group"
                          >
                            <div className="flex items-center gap-2">
                              <GripVertical
                                onTouchStart={(e) => handleTouchStart(e, 'footerSections', fIdx)}
                                onTouchMove={handleTouchMove}
                                onTouchEnd={handleTouchEnd}
                                onTouchCancel={handleTouchEnd}
                                className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#D4AF37] cursor-grab active:cursor-grabbing transition touch-none"
                              />
                              <div className="flex items-center gap-0.5">
                                <button type="button" onClick={(e) => { e.stopPropagation(); moveItemUp('footerSections', fIdx); }} disabled={fIdx === 0} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronUp className="w-3 h-3" /></button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); moveItemDown('footerSections', fIdx, footerSectionsOrder.length); }} disabled={fIdx === footerSectionsOrder.length - 1} className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"><ChevronDown className="w-3 h-3" /></button>
                              </div>
                              <span className="font-bold text-slate-200">Contact Information</span>
                            </div>
                            <Edit3 className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#D4AF37]" />
                          </div>
                        </div>
                      );
                    }

                return null;
              })}

                </div>
              )}
            </div>
          </div>
          )}

          </div>
        </aside>

        {/* 3. RIGHT LIVE PREVIEW AREA */}
        <main className="flex-1 bg-[#080A10] flex flex-col items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden relative w-full h-full min-w-0 min-h-0 select-none">
          {/* Responsive Preview Wrapper Frame with auto-fit containment */}
          <div className="w-full h-full max-w-full max-h-full flex flex-col items-center justify-center relative my-auto min-h-0 transition-all duration-300 ease-out p-1 sm:p-2">
            <div
              className={`
                bg-white text-slate-900 shadow-2xl transition-all duration-300 border flex flex-col overflow-hidden relative mx-auto my-auto
                ${deviceMode === 'desktop' ? 'w-full max-w-[1240px] h-full max-h-[calc(100vh-90px)] border-[#2E3548] rounded-2xl ring-1 ring-slate-800' : ''}
                ${deviceMode === 'tablet' ? 'w-full max-w-[768px] h-full max-h-[calc(100vh-90px)] border-[8px] border-slate-800 rounded-[32px] ring-1 ring-slate-700/60 shadow-2xl' : ''}
                ${deviceMode === 'mobile' ? 'w-full max-w-[380px] h-full max-h-[calc(100vh-90px)] border-[8px] sm:border-[10px] border-slate-800 rounded-[40px] sm:rounded-[44px] ring-1 ring-slate-700/60 shadow-2xl' : ''}
              `}
            >
              {/* Desktop Browser Header Bar */}
              {deviceMode === 'desktop' && (
                <div className="bg-slate-100 border-b border-slate-200 px-3 py-2 flex items-center justify-between shrink-0 select-none z-10">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-[#FF5F56] border border-red-600/30 inline-block" />
                    <span className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-amber-600/30 inline-block" />
                    <span className="w-3 h-3 rounded-full bg-[#27C93F] border border-green-600/30 inline-block" />
                  </div>
                  <div className="bg-white border border-slate-300/80 rounded-lg px-3 py-1 text-[11px] font-mono text-slate-600 flex items-center gap-2 max-w-sm w-full mx-auto shadow-2xs">
                    <span className="text-emerald-600 font-bold text-[10px]">🔒 https://</span>
                    <span className="truncate">{liveMerchant.storeSlug || 'my-store'}.zid.sa</span>
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:block">
                    1280px Desktop
                  </div>
                </div>
              )}

              {/* Tablet Top Lens Indicator */}
              {deviceMode === 'tablet' && (
                <div className="bg-slate-800 py-1 flex items-center justify-center shrink-0 z-10">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-700 inline-block" />
                </div>
              )}

              {/* Smartphone Notch Bar */}
              {deviceMode === 'mobile' && (
                <div className="bg-slate-800 pt-1.5 pb-1 flex items-center justify-center shrink-0 z-10">
                  <div className="w-28 h-3.5 bg-slate-900 rounded-full flex items-center justify-center gap-2 border border-slate-700/50">
                    <span className="w-2 h-2 rounded-full bg-slate-800 border border-slate-600" />
                    <span className="w-8 h-1 rounded-full bg-slate-700" />
                  </div>
                </div>
              )}

              {/* Scrollable Storefront Viewport Body */}
              <div className="flex-1 w-full overflow-y-auto overflow-x-hidden min-h-0 relative bg-white">
                <TenantStorefrontView
                  storeSlug={liveMerchant.storeSlug || 'demo'}
                  merchant={liveMerchant}
                  products={[]}
                  bankAccounts={[]}
                  mobileBanking={[]}
                  themes={[]}
                  isMobile={deviceMode === 'mobile'}
                  onPlaceOrder={(order) => {
                    console.log('Order placed in live customizer preview:', order);
                  }}
                />
              </div>

              {/* Smartphone / Tablet Home Bar Indicator at bottom */}
              {(deviceMode === 'mobile' || deviceMode === 'tablet') && (
                <div className="bg-slate-800 py-1.5 flex items-center justify-center shrink-0 z-10">
                  <span className="w-28 h-1 bg-slate-600 rounded-full inline-block" />
                </div>
              )}
            </div>
          </div>
        </main>
















      </div>

      {/* ZID-STYLE DRAWER MODAL: ADD NEW SECTION */}
      {showAddSectionModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex justify-end animate-fade-in">
          <div className="bg-[#131620] border-l border-[#2E3548] w-full max-w-2xl h-full flex flex-col shadow-2xl relative">

            {/* Drawer Sticky Header */}
            <div className="p-5 border-b border-[#2E3548] bg-[#181B26] space-y-3 shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full">
                      Zid Theme Builder
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">Homepage Layout</span>
                  </div>
                  <h3 className="font-extrabold text-white text-base mt-1 flex items-center gap-2">
                    <Plus className="w-4 h-4 text-[#D4AF37]" />
                    <span>Add Section to Homepage</span>
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setShowAddSectionModal(false);
                    setSectionSearchQuery('');
                  }}
                  className="p-2 text-slate-400 hover:text-white bg-[#202533] hover:bg-[#282E3F] rounded-xl border border-[#2E3548] transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Search Input Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by section name"
                  value={sectionSearchQuery}
                  onChange={(e) => setSectionSearchQuery(e.target.value)}
                  className="w-full bg-[#11131A] border border-[#2E3548] focus:border-[#D4AF37] text-white pl-10 pr-9 py-2.5 rounded-xl text-xs outline-none transition"
                />
                {sectionSearchQuery && (
                  <button
                    onClick={() => setSectionSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Selectable Visual Cards Section Library */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400 pb-1">
                <span className="font-semibold">Selectable Layout Blocks</span>
                <span className="font-mono text-[#D4AF37] text-[11px]">
                  {
                    [
                      { id: 'logo_social', name: 'Logo & Social' },
                      { id: 'image_carousel', name: 'Image Carousel' },
                      { id: 'partners', name: 'Partners' },
                      { id: 'products', name: 'Products' },
                      { id: 'video', name: 'Video' },
                      { id: 'hero_banner', name: 'Hero Banner' },
                      { id: 'gallery', name: 'Gallery' },
                      { id: 'categories', name: 'Categories' },
                      { id: 'countdown_timer', name: 'Countdown Timer' },
                      { id: 'call_to_action', name: 'Call To Action' },
                      { id: 'testimonials', name: 'Testimonials' },
                      { id: 'store_benefits', name: 'Store Benefits' }
                    ].filter(item => item.name.toLowerCase().includes(sectionSearchQuery.toLowerCase())).length
                  } / 12 items
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {[
                  {
                    id: 'logo_social',
                    name: 'Logo & Social',
                    desc: 'Display store logo alongside social media channels and handles.',
                    badge: 'Branding',
                    icon: Share2,
                    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
                    action: () => {
                      setShowSocialBlock(true);
                      setContentSectionsOrder(prev => {
                        if (prev.some(s => s.id === 'brand_social')) return prev;
                        return [...prev, { id: 'brand_social', key: 'brand_social', name: 'Logo & Social Media' }];
                      });
                      setHistoryLogs((prev) => [`Added 'Logo & Social' section`, ...prev]);
                    }
                  },
                  {
                    id: 'image_carousel',
                    name: 'Image Carousel',
                    desc: 'Multi-slide interactive hero banner with customizable transition effects.',
                    badge: 'Popular',
                    icon: ImageIcon,
                    color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
                    action: () => {
                      setShowHeroBanner(true);
                      setContentSectionsOrder(prev => {
                        if (prev.some(s => s.id === 'carousel')) return prev;
                        return [...prev, { id: 'carousel', key: 'carousel', name: 'Image Carousel' }];
                      });
                      setHistoryLogs((prev) => [`Added 'Image Carousel' section`, ...prev]);
                    }
                  },
                  {
                    id: 'partners',
                    name: 'Partners',
                    desc: 'Showcase verified partner brands, corporate clients, and payment options.',
                    badge: 'Trust',
                    icon: Building2,
                    color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
                    action: () => {
                      if (!addedSections.some(s => s.name === 'Partners')) {
                        setAddedSections(prev => [...prev, { id: `partners-${Date.now()}`, name: 'Partners' }]);
                      }
                      setHistoryLogs((prev) => [`Added 'Partners' section`, ...prev]);
                    }
                  },
                  {
                    id: 'products',
                    name: 'Products',
                    desc: 'Display product collections, trending items, or best sellers in grid.',
                    badge: 'Essential',
                    icon: ShoppingBag,
                    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
                    action: () => {
                      setShowFeaturedGrid(true);
                      setContentSectionsOrder(prev => {
                        if (prev.some(s => s.id === 'products')) return prev;
                        return [...prev, { id: 'products', key: 'products', name: 'Products' }];
                      });
                      setHistoryLogs((prev) => [`Added 'Products' section`, ...prev]);
                    }
                  },
                  {
                    id: 'video',
                    name: 'Video',
                    desc: 'Embed product video, behind-the-scenes handloom, or promo video player.',
                    badge: 'Media',
                    icon: Video,
                    color: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
                    action: () => {
                      setShowVideo(true);
                      setContentSectionsOrder(prev => {
                        if (prev.some(s => s.id === 'video')) return prev;
                        return [...prev, { id: 'video', key: 'video', name: 'Video' }];
                      });
                      setHistoryLogs((prev) => [`Added 'Video' section`, ...prev]);
                    }
                  },
                  {
                    id: 'hero_banner',
                    name: 'Hero Banner',
                    desc: 'Full-width static high-impact hero banner block with call to action button.',
                    badge: 'Spotlight',
                    icon: Maximize2,
                    color: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
                    action: () => {
                      if (!addedSections.some(s => s.name === 'Hero Banner')) {
                        setAddedSections(prev => [...prev, { id: `hero-${Date.now()}`, name: 'Hero Banner' }]);
                      }
                      setHistoryLogs((prev) => [`Added 'Hero Banner' section`, ...prev]);
                    }
                  },
                  {
                    id: 'gallery',
                    name: 'Gallery',
                    desc: 'High-definition photo gallery showcasing artisan craftsmanship details.',
                    badge: 'Artisan',
                    icon: Grid,
                    color: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
                    action: () => {
                      setShowGallery(true);
                      setContentSectionsOrder(prev => {
                        if (prev.some(s => s.id === 'gallery')) return prev;
                        return [...prev, { id: 'gallery', key: 'gallery', name: 'Gallery' }];
                      });
                      setHistoryLogs((prev) => [`Added 'Gallery' section`, ...prev]);
                    }
                  },
                  {
                    id: 'categories',
                    name: 'Categories',
                    desc: 'Featured product category tiles with background overlays and item counts.',
                    badge: 'Popular',
                    icon: Layers,
                    color: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
                    action: () => {
                      setShowCategories(true);
                      setContentSectionsOrder(prev => {
                        if (prev.some(s => s.id === 'categories')) return prev;
                        return [...prev, { id: 'categories', key: 'categories', name: 'Categories' }];
                      });
                      setHistoryLogs((prev) => [`Added 'Categories' section`, ...prev]);
                    }
                  },
                  {
                    id: 'countdown_timer',
                    name: 'Countdown Timer',
                    desc: 'Urgency countdown timer bar with sale end date picker and coupon text.',
                    badge: 'High Convert',
                    icon: Clock,
                    color: 'text-red-400 bg-red-500/10 border-red-500/20',
                    action: () => {
                      setShowCountdown(true);
                      setContentSectionsOrder(prev => {
                        if (prev.some(s => s.id === 'countdown')) return prev;
                        return [...prev, { id: 'countdown', key: 'countdown', name: 'Countdown Timer' }];
                      });
                      setHistoryLogs((prev) => [`Added 'Countdown Timer' section`, ...prev]);
                    }
                  },
                  {
                    id: 'call_to_action',
                    name: 'Call To Action',
                    desc: 'Compelling CTA banner section encouraging purchases or newsletter signup.',
                    badge: 'Lead Gen',
                    icon: Megaphone,
                    color: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
                    action: () => {
                      if (!addedSections.some(s => s.name === 'Call To Action')) {
                        setAddedSections(prev => [...prev, { id: `cta-${Date.now()}`, name: 'Call To Action' }]);
                      }
                      setHistoryLogs((prev) => [`Added 'Call To Action' section`, ...prev]);
                    }
                  },
                  {
                    id: 'testimonials',
                    name: 'Testimonials',
                    desc: 'Customer reviews, star ratings, and verified buyer feedback quotes.',
                    badge: 'Social Proof',
                    icon: Star,
                    color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
                    action: () => {
                      if (!addedSections.some(s => s.name === 'Testimonials')) {
                        setAddedSections(prev => [...prev, { id: `testimonials-${Date.now()}`, name: 'Testimonials' }]);
                      }
                      setHistoryLogs((prev) => [`Added 'Testimonials' section`, ...prev]);
                    }
                  },
                  {
                    id: 'store_benefits',
                    name: 'Store Benefits',
                    desc: 'Highlight free shipping, cash on delivery nationwide, and 7-day easy returns.',
                    badge: 'Trust',
                    icon: ShieldCheck,
                    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
                    action: () => {
                      if (!addedSections.some(s => s.name === 'Store Benefits')) {
                        setAddedSections(prev => [...prev, { id: `benefits-${Date.now()}`, name: 'Store Benefits' }]);
                      }
                      setHistoryLogs((prev) => [`Added 'Store Benefits' section`, ...prev]);
                    }
                  }
                ]
                  .filter(item =>
                    item.name.toLowerCase().includes(sectionSearchQuery.toLowerCase()) ||
                    item.desc.toLowerCase().includes(sectionSearchQuery.toLowerCase()) ||
                    item.badge.toLowerCase().includes(sectionSearchQuery.toLowerCase())
                  )
                  .map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          item.action();
                          setShowAddSectionModal(false);
                          setSectionSearchQuery('');
                          setShowSuccessToast(true);
                          setTimeout(() => setShowSuccessToast(false), 2500);
                        }}
                        className="group bg-[#181B26] hover:bg-[#202533] border border-[#2E3548] hover:border-[#D4AF37] p-4 rounded-2xl transition duration-200 cursor-pointer flex flex-col justify-between space-y-3 shadow-md hover:shadow-xl hover:shadow-[#D4AF37]/5"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className={`p-2 rounded-xl border ${item.color}`}>
                              <ItemIcon className="w-4 h-4" />
                            </div>
                            <span className="text-[10px] font-bold text-slate-400 bg-[#252B3B] border border-[#32394E] px-2 py-0.5 rounded-full">
                              {item.badge}
                            </span>
                          </div>

                          <div>
                            <h4 className="font-extrabold text-white text-xs group-hover:text-[#D4AF37] transition flex items-center justify-between">
                              <span>{item.name}</span>
                              <Plus className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition text-[#D4AF37]" />
                            </h4>
                            <p className="text-[11px] text-slate-400 leading-snug mt-1">
                              {item.desc}
                            </p>
                          </div>
                        </div>

                        {/* Visual Miniature Preview Bar */}
                        <div className="bg-[#11131A] border border-[#2A3144] rounded-lg p-2 flex items-center justify-center opacity-70 group-hover:opacity-100 transition">
                          <div className="w-full h-5 rounded flex items-center justify-between px-2 bg-[#1F2432]">
                            <div className="w-8 h-1.5 rounded bg-slate-600" />
                            <div className="flex gap-1">
                              <div className="w-2 h-2 rounded-full bg-[#D4AF37]" />
                              <div className="w-2 h-2 rounded-full bg-slate-600" />
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="w-full bg-[#252B3B] group-hover:bg-[#D4AF37] text-slate-300 group-hover:text-slate-950 font-extrabold text-xs py-2 rounded-xl border border-[#32394E] group-hover:border-[#D4AF37] transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Select Section</span>
                        </button>
                      </div>
                    );
                  })}
              </div>

              {sectionSearchQuery && [
                'logo_social', 'image_carousel', 'partners', 'products', 'video', 'hero_banner', 'gallery', 'categories', 'countdown_timer', 'call_to_action', 'testimonials', 'store_benefits'
              ].filter(id => id.includes(sectionSearchQuery.toLowerCase())).length === 0 && (
                <div className="text-center py-10 space-y-2">
                  <Search className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs text-slate-400">No sections found matching "<span className="text-white font-bold">{sectionSearchQuery}</span>"</p>
                  <button
                    onClick={() => setSectionSearchQuery('')}
                    className="text-[#D4AF37] text-xs font-bold hover:underline cursor-pointer"
                  >
                    Clear Search
                  </button>
                </div>
              )}
            </div>

            {/* Footer status */}
            <div className="p-4 border-t border-[#2E3548] bg-[#181B26] text-center text-[11px] text-slate-400 shrink-0">
              Click any section card to insert it directly into your homepage layout.
            </div>

          </div>
        </div>
      )}

      {/* VERSION HISTORY MODAL */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#1D212E] border border-[#2E3548] w-full max-w-md rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#2E3548] pb-3">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <History className="w-4 h-4 text-[#D4AF37]" />
                <span>Theme Change History</span>
              </h3>
              <button onClick={() => setShowHistoryModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto text-xs">
              {historyLogs.map((log, idx) => (
                <div key={idx} className="p-2.5 bg-[#181B26] border border-[#2E3548] rounded-xl flex items-center gap-2 text-slate-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                  <span>{log}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowHistoryModal(false)}
              className="w-full bg-[#282E3F] text-white font-bold py-2 rounded-xl text-xs cursor-pointer"
            >
              Close History
            </button>
          </div>
        </div>
      )}

      {/* DISCARD CONFIRMATION MODAL */}
      {showDiscardModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">Discard Unsaved Changes?</h3>
                <p className="text-xs text-slate-400">Revert all edits to the last published state</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-[#202533] p-3.5 rounded-xl border border-[#2E3548]">
              Are you sure you want to discard all pending edits? This will undo all section reordering, text changes, and layout modifications made in this session.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowDiscardModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#252B3B] hover:bg-[#2E3548] text-slate-200 border border-[#3A435E] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDiscardConfirm}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20 transition cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Discard Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UNSAVED CHANGES EXIT CONFIRMATION MODAL */}
      {showExitConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <Save className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">Unsaved Changes Pending</h3>
                <p className="text-xs text-slate-400">You have pending edits in your theme editor</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-[#202533] p-3.5 rounded-xl border border-[#2E3548]">
              What would you like to do with your theme changes before closing the customizer?
            </p>

            <div className="grid grid-cols-1 gap-2 pt-1">
              <PremiumLockedWrapper>
                <button
                  type="button"
                  onClick={() => {
                    performPublish();
                    setShowExitConfirmModal(false);
                    onClose();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 fill-white" />
                  <span>Publish & Exit</span>
                </button>
              </PremiumLockedWrapper>

              <button
                type="button"
                onClick={() => {
                  handleSaveDraft();
                  setShowExitConfirmModal(false);
                  onClose();
                }}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-[#202533] hover:bg-[#282E3F] text-amber-300 border border-amber-500/40 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Draft & Exit</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  handleDiscardConfirm();
                  setShowExitConfirmModal(false);
                  onClose();
                }}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Discard & Exit</span>
              </button>

              <button
                type="button"
                onClick={() => setShowExitConfirmModal(false)}
                className="w-full py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer text-center pt-1"
              >
                Keep Editing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PUBLISH CONFIRMATION MODAL */}
      {showPublishConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-emerald-400">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">Publish Changes?</h3>
                <p className="text-xs text-slate-400">Are you sure you want to go live?</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-[#202533] p-3.5 rounded-xl border border-[#2E3548]">
              This will commit your current theme modifications globally. Your storefront will be updated immediately.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowPublishConfirmModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#252B3B] hover:bg-[#2E3548] text-slate-200 border border-[#3A435E] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={performPublish}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20 transition cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Publish Now</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
