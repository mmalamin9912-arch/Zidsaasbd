import fs from 'fs';
const path = 'src/components/MarketplaceCheckoutView.tsx';
let content = fs.readFileSync(path, 'utf8');

const old = `                        \`One delivery charge covers all \${vendors.length} sellers. Each seller ships separately with its own tracking number.\`,
                        \`একটি ডেলিভারি চার্জেই \${vendors.length}টি সেলারের পণ্য কভার হবে। প্রত্যেকে আলাদা ট্র্যাকিং নম্বর সহ পাঠাবেন।\`,`;

const newText = `                        \`Each seller charges its own delivery fee. Every seller ships separately with its own tracking number.\`,
                        \`প্রত্যেক সেলার আলাদা ডেলিভারি চার্জ নেবেন। প্রত্যেকে আলাদা ট্র্যাকিং নম্বর সহ পাঠাবেন।\`,`;

let oldCRLF = old.replace(/\n/g, '\r\n');
let newCRLF = newText.replace(/\n/g, '\r\n');

if (content.includes(oldCRLF)) {
  content = content.replace(oldCRLF, newCRLF);
  fs.writeFileSync(path, content, 'utf8');
  console.log('REPLACED note (CRLF)');
} else if (content.includes(old)) {
  content = content.replace(old, newText);
  fs.writeFileSync(path, content, 'utf8');
  console.log('REPLACED note (LF)');
} else {
  console.log('NOTE TEXT NOT FOUND');
  const idx = content.indexOf('One delivery charge');
  if (idx >= 0) console.log('Found at:', idx, JSON.stringify(content.slice(idx, idx + 100)));
}