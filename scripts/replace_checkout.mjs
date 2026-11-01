import fs from 'fs';
const path = 'src/components/MarketplaceCheckoutView.tsx';
let content = fs.readFileSync(path, 'utf8');

// Normalize line endings for matching, but preserve original
const old = `  const shippingZone = shippingZoneOf(form.district);
  const isInsideDhaka = shippingZone === 'inside';
  const deliveryCharge = itemCount === 0 ? 0 : deliveryFeeOf(shippingZone) * Math.max(1, vendors.length);
  const bkashCashOutFee = payment === 'bkash' ? Math.round((subtotal + deliveryCharge) * 0.01) : 0;
  const total = subtotal + deliveryCharge + bkashCashOutFee;`;

const newText = `  // Delivery zone: derived from district, overridable by the shopper
  const [shippingZone, setShippingZone] = useState<ShippingZone | null>(null);
  const resolvedZone = shippingZone ?? shippingZoneOf(form.district);
  const isInsideDhaka = resolvedZone === 'inside';

  // Per-vendor delivery: each store charges its own delivery fee for the zone.
  const perVendorDelivery = itemCount === 0 ? 0 : deliveryFeeOf(resolvedZone);
  const totalDeliveryCharge = perVendorDelivery * vendors.length;

  // bKash cash-out charge (merchant-configured percentage, default 1%).
  const isBkash = payment === 'bkash';
  const bkashCashOutFee = isBkash ? Math.round((subtotal + totalDeliveryCharge) * 0.01) : 0;
  const total = subtotal + totalDeliveryCharge + bkashCashOutFee;`;

// Try with CRLF first
let oldCRLF = old.replace(/\n/g, '\r\n');
let newCRLF = newText.replace(/\n/g, '\r\n');

if (content.includes(oldCRLF)) {
  content = content.replace(oldCRLF, newCRLF);
  fs.writeFileSync(path, content, 'utf8');
  console.log('REPLACED delivery charge logic (CRLF)');
} else if (content.includes(old)) {
  content = content.replace(old, newText);
  fs.writeFileSync(path, content, 'utf8');
  console.log('REPLACED delivery charge logic (LF)');
} else {
  console.log('OLD TEXT NOT FOUND');
}