// Smart Fallback Engine for Zid AI.
//
// This module is intentionally dependency-free and isomorphic: the server
// (`lib/serverApp.ts`) imports it to answer when no LLM API key is configured,
// and the browser (`ZidAiAssistant`, `Header`) imports it when the live request
// fails. Keeping it in one place means the offline answers a merchant sees are
// identical no matter which layer served them.
//
// The goal is to NEVER show a generic "temporarily unavailable" error. Instead we
// classify the question and return concrete, step-by-step platform guidance in
// the same language the merchant used (Bengali script, Banglish, or English).

export type ZidAiLanguage = 'bn' | 'en';

/**
 * Detects whether the user wrote in Bengali (script) or Banglish (romanized
 * Bengali). Both are treated as "Bengali" for answer selection because Banglish
 * speakers expect a Bengali reply.
 */
export function detectZidAiLanguage(text: string): ZidAiLanguage {
  if (/[\u0980-\u09FF]/.test(text)) return 'bn';
  const banglish = /\b(ami|amar|amake|kivabe|kibhabe|kemne|kemon|kothay|kothae|korte|korbo|korle|kore|pari|parbo|hobe|hoy|koto|koyta|keno|kano|jonno|lagbe|lagche|chai|dorkar|bikri|bikroy|dokan|ache|achhe|chilo|korchen|korben|hocche|hoche|jabe|kora|hvbe|dao|den|bolun|janan|sahajjo|shahajjo|somossya|problem|taka|poysha|paisa|order|plan)\b/i.test(
    text
  );
  return banglish ? 'bn' : 'en';
}

/** True when the text is Bengali script or Banglish. */
export function looksBengali(text: string): boolean {
  return detectZidAiLanguage(text) === 'bn';
}

interface FallbackAnswers {
  plan: string;
  paymentVerify: string;
  billingIssue: string;
  order: string;
  product: string;
  payment: string;
  domain: string;
  shipping: string;
  growth: string;
  account: string;
  greeting: string;
  default: string;
}

/**
 * Bengali and English answers for each intent. Each answer is concrete,
 * actionable, and mirrors the platform's real tab/feature names.
 */
const ANSWERS: Record<ZidAiLanguage, FallbackAnswers> = {
  bn: {
    plan:
      "প্ল্যান আপগ্রেড বা কেনাকাটার ধাপসমূহ:\n\n" +
      "১) ড্যাশবোর্ডে 'Subscription' বা 'Plan' অপশনে যান।\n" +
      "২) পছন্দের প্ল্যান নির্বাচন করে পেমেন্ট করুন (bKash/Nagad/কার্ড)।\n" +
      "৩) পেমেন্টের TrxID সংরক্ষণ করুন — এটি যাচাইয়ের জন্য লাগবে।\n\n" +
      "গুরুত্বপূর্ণ: প্ল্যান কেনার পর তা 'Pending' স্ট্যাটাসে থাকে যতক্ষণ না Admin আপনার পেমেন্ট যাচাই করেন। যাচাই হওয়ার পর প্ল্যান স্বয়ংক্রিয়ভাবে অ্যাক্টিভ হয়ে যাবে। সাধারণত কয়েক ঘণ্টার মধ্যে যাচাই সম্পন্ন হয়।\n\n" +
      "অনেক সময় পার হলেও প্ল্যান অ্যাক্টিভ না হলে, TrxID সহ প্ল্যাটফর্ম সাপোর্টে যোগাযোগ করুন।",
    paymentVerify:
      "পেমেন্ট ভেরিফিকেশনের জন্য:\n\n" +
      "১) আপনার পেমেন্টের TrxID/স্ক্রিনশট সংরক্ষণ করুন।\n" +
      "২) 'Subscription' সেকশনে গিয়ে স্ট্যাটাস দেখুন — 'Pending_Approval' মানে Admin এখনো যাচাই করেননি।\n" +
      "৩) যাচাই সম্পন্ন হলে স্ট্যাটাস স্বয়ংক্রিয়ভাবে 'Active' হয়ে যাবে।\n\n" +
      "২৪ ঘণ্টার বেশি সময় পার হলেও যাচাই না হলে, TrxID সহ সাপোর্টে টিকিট করুন।",
    billingIssue:
      "বিলিং সমস্যা সমাধানের জন্য:\n\n" +
      "১) পেমেন্ট কেটে নেওয়া হয়েছে কিন্তু প্ল্যান অ্যাক্টিভ হয়নি — এটি সাধারণত Admin যাচাইয়ের অপেক্ষায় থাকার কারণে হয়।\n" +
      "২) আপনার TrxID ও পেমেন্টের সময় সংরক্ষণ করুন।\n" +
      "৩) প্ল্যাটফর্ম সাপোর্টে যোগাযোগ করুন — অ্যাডমিন ম্যানুয়ালি যাচাই করে প্ল্যান অ্যাক্টিভ করবেন।\n\n" +
      "ভুল প্ল্যান অ্যাক্টিভ হলে সাপোর্টকে জানালে সেটি সংশোধন করা হবে।",
    order:
      "অর্ডার ম্যানেজমেন্টের জন্য:\n\n" +
      "১) 'Orders' ট্যাবে গিয়ে সব অর্ডার দেখুন।\n" +
      "২) প্রতিটি অর্ডারে ক্লিক করে গ্রাহকের তথ্য ও পণ্য দেখুন।\n" +
      "৩) স্ট্যাটাস আপডেট করুন — Pending → Confirmed → Shipped → Delivered।\n" +
      "৪) কুরিয়ার ডিসপ্যাচ করলে ট্র্যাকিং আইডি যোগ করুন।\n\n" +
      "স্টক কমে গেলে অর্ডার কনফার্ম করার আগে স্টক আপডেট করুন।",
    product:
      "পণ্য যোগ বা সম্পাদনার জন্য:\n\n" +
      "১) 'Products' ট্যাবে যান এবং 'Add Product' এ ক্লিক করুন।\n" +
      "২) পণ্যের নাম, দাম, স্টক ও ক্যাটাগরি দিন।\n" +
      "৩) ভালো মানের ছবি (কমপক্ষে ৩টি) যোগ করুন।\n" +
      "৪) 'Save' এ ক্লিক করুন — পণ্য সাথে সাথে স্টোরফ্রন্টে দেখা যাবে।\n\n" +
      "পণ্য এডিট করতে Products তালিকা থেকে পণ্যে ক্লিক করে পরিবর্তন করে সেভ করুন।",
    payment:
      "পেমেন্ট গেটওয়ে চালু করার জন্য:\n\n" +
      "১) 'Settings' → 'Payments' এ যান।\n" +
      "২) bKash, Nagad, কার্ড বা Cash on Delivery (COD) চালু করুন।\n" +
      "৩) ব্যবসার জন্য bKash/Nagad মার্চেন্ট নম্বর ও প্রয়োজনীয় তথ্য সংরক্ষণ করুন।\n\n" +
      "টিপস: COD-এর সাথে bKash অফার করলে গ্রাহক আস্থা বাড়ে ও কনভার্সন উন্নত হয়।",
    domain:
      "কাস্টম ডোমেইন যুক্ত করার জন্য:\n\n" +
      "১) 'Settings' → 'Domains' এ যান।\n" +
      "২) আপনার ডোমেইনের নাম লিখে যোগ করুন।\n" +
      "৩) প্ল্যাটফর্মে দেখানো নির্দেশনা অনুযায়ী DNS রেকর্ড (CNAME/A) আপডেট করুন।\n" +
      "৪) DNS প্রপাগেট হতে কিছুক্ষণ সময় লাগতে পারে।\n\n" +
      "সমস্যা হলে ডোমেইন প্রোভাইডারের DNS সেটিংস যাচাই করুন।",
    shipping:
      "শিপিং ও কুরিয়ার সেটআপের জন্য:\n\n" +
      "১) 'Settings' → 'Shipping' এ গিয়ে আপনার জোন ও ডেলিভারি চার্জ নির্ধারণ করুন।\n" +
      "২) পছন্দের কুরিয়ার (Steadfast, Pathao, RedX ইত্যাদি) সংযুক্ত করুন।\n" +
      "৩) অর্ডার ডিসপ্যাচ করলে কুরিয়ার ট্র্যাকিং আইডি যোগ করুন।\n\n" +
      "ফ্রি শিপিং থ্রেশহোল্ড দিলে বড় অর্ডার বাড়ে।",
    growth:
      "বিক্রয় বাড়ানোর কার্যকর উপায়:\n\n" +
      "১) ফ্ল্যাশ সেল ও কাউন্টডাউন টাইমার ব্যবহার করুন — তাৎক্ষণিক অর্ডার বাড়ে।\n" +
      "২) Facebook/Instagram-এ নিয়মিত পণ্যের ভিডিও ও রিলস পোস্ট করুন।\n" +
      "৩) বান্ডেল অফার ও 'Buy 2 Get 1' ধরনের ডিল চালু করুন।\n" +
      "৪) পুরনো গ্রাহকদের WhatsApp-এ নতুন অফার পাঠান।\n" +
      "৫) পরিত্যক্ত কার্ট (abandoned cart) রিকভারি চালু করুন।\n" +
      "৬) bKash/Nagad-এ ছাড় দিলে ডিজিটাল পেমেন্ট কনভার্সন বাড়ে।",
    account:
      "অ্যাকাউন্ট ও সেটিংস সংক্রান্ত:\n\n" +
      "১) প্রোফাইল তথ্য আপডেট করতে 'Settings' → 'Profile' এ যান।\n" +
      "২) পাসওয়ার্ড পরিবর্তন করতে 'Settings' → 'Security' ব্যবহার করুন।\n" +
      "৩) লগইন সমস্যা হলে পাসওয়ার্ড রিসেট করে আবার চেষ্টা করুন।\n\n" +
      "সমস্যা থাকলে সাপোর্টে যোগাযোগ করুন।",
    greeting:
      "আসসালামু আলাইকুম! আমি Zid AI — আপনার সেলস কোপাইলট ও প্ল্যাটফর্ম সাপোর্ট সহকারী।\n\n" +
      "আমি আপনাকে সাহায্য করতে পারি:\n" +
      "• পণ্য যোগ ও এডিট করা\n" +
      "• অর্ডার ম্যানেজমেন্ট\n" +
      "• পেমেন্ট ও প্ল্যান/সাবস্ক্রিপশন\n" +
      "• বিক্রয় বৃদ্ধির টিপস\n\n" +
      "আপনি কী জানতে চান, লিখুন।",
    default:
      "আমি Zid AI — আপনার সেলস কোপাইলট ও প্ল্যাটফর্ম সাপোর্ট সহকারী।\n\n" +
      "আমি এই বিষয়গুলোতে সাহায্য করতে পারি:\n" +
      "• পণ্য যোগ, এডিট ও স্টক ম্যানেজমেন্ট\n" +
      "• অর্ডার প্রসেসিং ও কুরিয়ার ডিসপ্যাচ\n" +
      "• পেমেন্ট (bKash/Nagad/COD) সেটআপ\n" +
      "• প্ল্যান আপগ্রেড ও সাবস্ক্রিপশন স্ট্যাটাস\n" +
      "• বিক্রয় ও মার্কেটিং কৌশল\n\n" +
      "আপনার নির্দিষ্ট প্রশ্নটি লিখুন, আমি ধাপে ধাপে সমাধান দেব।",
  },
  en: {
    plan:
      "Steps to upgrade or purchase a plan:\n\n" +
      "1) Open the 'Subscription' / 'Plan' section from your dashboard.\n" +
      "2) Choose the plan you want and pay via bKash / Nagad / card.\n" +
      "3) Save your payment TrxID — you will need it for verification.\n\n" +
      "Important: after purchase, the plan stays in 'Pending' status until the Admin verifies your payment. Once verified, your plan is activated automatically — usually within a few hours.\n\n" +
      "If it stays inactive well beyond that, contact platform support with your TrxID.",
    paymentVerify:
      "To get your payment verified:\n\n" +
      "1) Keep your payment TrxID and screenshot safe.\n" +
      "2) Check the 'Subscription' section — 'Pending_Approval' means the Admin has not verified it yet.\n" +
      "3) Once verified, the status changes to 'Active' automatically.\n\n" +
      "If more than 24 hours pass without verification, raise a support ticket with your TrxID.",
    billingIssue:
      "To resolve a billing issue:\n\n" +
      "1) If you were charged but the plan is not active, it is normally waiting for Admin verification.\n" +
      "2) Save your TrxID and the payment time.\n" +
      "3) Contact platform support — the admin verifies manually and activates the plan.\n\n" +
      "If the wrong plan was activated, tell support and it will be corrected.",
    order:
      "To manage orders:\n\n" +
      "1) Open the 'Orders' tab to see all orders.\n" +
      "2) Click an order to view the customer details and items.\n" +
      "3) Update the status — Pending → Confirmed → Shipped → Delivered.\n" +
      "4) When you dispatch, add the courier tracking ID.\n\n" +
      "Update stock before confirming an order if inventory is low.",
    product:
      "To add or edit a product:\n\n" +
      "1) Go to the 'Products' tab and click 'Add Product'.\n" +
      "2) Fill in the title, price, stock and category.\n" +
      "3) Add good quality images (at least 3).\n" +
      "4) Click 'Save' — the product appears on your storefront immediately.\n\n" +
      "To edit, open the product from the Products list, change the fields and save.",
    payment:
      "To enable payment gateways:\n\n" +
      "1) Go to 'Settings' → 'Payments'.\n" +
      "2) Enable bKash, Nagad, card, or Cash on Delivery (COD).\n" +
      "3) Save your merchant number and required details.\n\n" +
      "Tip: offering bKash alongside COD builds trust and improves conversion.",
    domain:
      "To connect a custom domain:\n\n" +
      "1) Go to 'Settings' → 'Domains'.\n" +
      "2) Enter your domain name and add it.\n" +
      "3) Update your DNS records (CNAME/A) exactly as instructed.\n" +
      "4) DNS propagation can take some time.\n\n" +
      "If it fails, verify the DNS settings at your domain provider.",
    shipping:
      "To set up shipping and couriers:\n\n" +
      "1) Go to 'Settings' → 'Shipping' and define your zones and delivery charges.\n" +
      "2) Connect your preferred courier (Steadfast, Pathao, RedX, etc.).\n" +
      "3) Add the courier tracking ID when you dispatch an order.\n\n" +
      "A free-shipping threshold encourages larger orders.",
    growth:
      "Practical ways to grow your sales:\n\n" +
      "1) Run flash sales with countdown timers — this drives immediate orders.\n" +
      "2) Post product videos and reels regularly on Facebook/Instagram.\n" +
      "3) Offer bundles and 'Buy 2 Get 1' style deals.\n" +
      "4) Re-engage past customers on WhatsApp with new offers.\n" +
      "5) Turn on abandoned-cart recovery.\n" +
      "6) Offer a small discount on bKash/Nagad to lift digital-payment conversion.",
    account:
      "Account & settings help:\n\n" +
      "1) Update your profile under 'Settings' → 'Profile'.\n" +
      "2) Change your password under 'Settings' → 'Security'.\n" +
      "3) If you cannot log in, reset your password and try again.\n\n" +
      "Still stuck? Contact platform support.",
    greeting:
      "Hello! I am Zid AI — your Sales Copilot & Platform Support Specialist.\n\n" +
      "I can help you with:\n" +
      "• Adding and editing products\n" +
      "• Order management\n" +
      "• Payments and plans/subscriptions\n" +
      "• Sales growth tips\n\n" +
      "What would you like to know?",
    default:
      "I am Zid AI — your Sales Copilot & Platform Support Specialist.\n\n" +
      "I can help with:\n" +
      "• Adding, editing and managing products & stock\n" +
      "• Order processing and courier dispatch\n" +
      "• Payment setup (bKash / Nagad / COD)\n" +
      "• Plan upgrades and subscription status\n" +
      "• Sales & marketing strategy\n\n" +
      "Tell me your specific question and I will walk you through it step by step.",
  },
};

/**
 * Returns a concrete, step-by-step answer for the merchant's question.
 *
 * This is the "smart fallback engine": it classifies the intent by keyword (in
 * both Bengali script and English/Banglish) and returns real platform guidance.
 * It is used when no API key is configured or the live model cannot be reached,
 * so the merchant always gets a useful answer instead of a generic error.
 */
export function getZidAiSmartFallback(query: string): string {
  const raw = (query || '').trim();
  const lang = detectZidAiLanguage(raw);
  const a = ANSWERS[lang];
  const q = raw.toLowerCase();

  // Greetings / empty input.
  if (!raw || /^(hi|hello|hey|salam|assalam|assalamu|আসসালামু|হ্যালো|হাই)\b/.test(q)) {
    return a.greeting;
  }

  // Plan upgrade pending / subscription / billing — the most common support ask.
  if (
    /(plan|subscription|upgrade|billing|package|renew|approve|approval|verify|verification|pending)/.test(q) ||
    /(প্ল্যান|সাবস্ক্রিপশন|আপগ্রেড|বিলিং|পেন্ডিং|নবায়ন|যাচাই)/.test(raw)
  ) {
    if (/pending|approve|approval|verify|verification|পেন্ডিং|যাচাই/.test(q) || /(পেন্ডিং|যাচাই)/.test(raw)) {
      return a.paymentVerify;
    }
    if (/billing|charged|refund|bill|বিলিং/.test(q) || /(বিলিং)/.test(raw)) {
      return a.billingIssue;
    }
    return a.plan;
  }

  if (/domain/.test(q) || /ডোমেইন/.test(raw)) return a.domain;
  if (/shipping|courier|delivery|steadfast|pathao|redx/.test(q) || /(শিপিং|কুরিয়ার|ডেলিভারি)/.test(raw)) return a.shipping;
  if (/product|upload|stock|inventory|category/.test(q) || /(পণ্য|আপলোড|স্টক|ইনভেন্টরি|ক্যাটাগরি)/.test(raw)) return a.product;
  if (/order|deliver|customer/.test(q) || /(অর্ডার|গ্রাহক)/.test(raw)) return a.order;
  if (/payment|bkash|nagad|cod|checkout|gateway|settlement/.test(q) || /(পেমেন্ট|বিকাশ|নগদ|চেকআউট)/.test(raw)) return a.payment;
  if (/account|password|login|profile|security/.test(q) || /(অ্যাকাউন্ট|পাসওয়ার্ড|লগইন|প্রোফাইল)/.test(raw)) return a.account;
  if (/sale|sales|grow|growth|market|marketing|revenue|analytic|tips|advertis|boost|promot|seo|campaign|discount|coupon/.test(q) || /(বিক্রি|বিক্রয়|মার্কেটিং|বৃদ্ধি|টিপস|গ্রোথ|ক্যাম্পেইন|ছাড়)/.test(raw)) {
    return a.growth;
  }

  return a.default;
}