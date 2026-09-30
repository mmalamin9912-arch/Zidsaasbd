import { Router } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { updateAdminMerchantSlug } from './adminMerchants.js';

export const adminMerchantSlugRouter = Router();

adminMerchantSlugRouter.patch('/api/admin/merchants/:id/slug', async (req, res) => {
  // The legacy gateway PIN is client-side only; never trust its session flag.
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!password) return res.status(503).json({ ok: false, error: 'Admin slug editing is not configured on the server.' });
  const supplied = req.get('X-Admin-Password') || '';
  const digest = (value: string) => createHash('sha256').update(value).digest();
  if (!supplied || !timingSafeEqual(digest(supplied), digest(password))) {
    return res.status(403).json({ ok: false, error: 'Invalid admin password.' });
  }
  try {
    const result = await updateAdminMerchantSlug(req.params.id, req.body?.store_slug, req.body?.expected_store_slug);
    const { status, ...body } = result;
    return res.status(status).json(body);
  } catch {
    return res.status(503).json({ ok: false, error: 'The store slug could not be updated. Please try again.' });
  }
});
