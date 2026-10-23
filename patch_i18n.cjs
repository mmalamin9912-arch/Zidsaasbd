const fs = require('fs');
const filepath = 'c:/Users/Dell/Desktop/zid-bd-merchant-dashboard/src/lib/i18n.tsx';
let content = fs.readFileSync(filepath, 'utf8');
content = content.replace(/\r\n/g, '\n');

// ─── Add English i18n keys for review photo upload ───
const oldEnKey = `    'sf_review_after_delivery': 'Available after delivery',`;
const newEnKey = `    'sf_review_after_delivery': 'Available after delivery',
    'sf_review_add_photo': 'Add photos (optional)',
    'sf_review_add_photo_btn': 'Gallery',
    'sf_review_camera_btn': 'Camera',
    'sf_review_photos_selected': 'photos added',`;

// ─── Add Bangla i18n keys for review photo upload ───
const oldBnKey = `    'sf_review_after_delivery': 'ডেলিভারির পরে দেখতে পাবেন',`;
const newBnKey = `    'sf_review_after_delivery': 'ডেলিভারির পরে দেখতে পাবেন',
    'sf_review_add_photo': 'ছবি যোগ করুন (ঐচ্ছিক)',
    'sf_review_add_photo_btn': 'গ্যালারি',
    'sf_review_camera_btn': 'ক্যামেরা',
    'sf_review_photos_selected': 'টি ছবি যোগ হয়েছে',`;

let changed = 0;

if (content.includes(oldEnKey)) {
  content = content.replace(oldEnKey, newEnKey);
  changed++;
  console.log('English i18n keys added');
} else {
  console.log('English i18n key not found');
}

if (content.includes(oldBnKey)) {
  content = content.replace(oldBnKey, newBnKey);
  changed++;
  console.log('Bangla i18n keys added');
} else {
  console.log('Bangla i18n key not found');
}

if (changed > 0) {
  fs.writeFileSync(filepath, content, 'utf8');
  console.log('i18n file saved');
}
