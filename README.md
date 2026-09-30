# Full-Stack React App

This project is configured to run both locally and be effortlessly deployed to **Vercel** with a Node.js backend.

## 🚀 Deploying to Vercel

The project comes pre-configured with a `vercel.json` file to route traffic to the Vite single-page application and the Express API serverless functions.

### 1. Import Project
1. Push your code to a GitHub repository.
2. Go to your [Vercel Dashboard](https://vercel.com/dashboard) and click **Add New...** -> **Project**.
3. Import your GitHub repository.

### 2. Configure Environment Variables
During the Vercel import process, ensure you expand the **Environment Variables** section and add the following keys exactly as they appear in `.env.example`:

- `GEMINI_API_KEY`: Your Gemini API key for AI features.
- `MONGODB_URI`: Your MongoDB connection string.
- `JWT_SECRET`: A secure random string for signing auth tokens (e.g., `my-super-secret-jwt-key`).
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`: If using Supabase.
- **SMTP_* Variables**: For email notifications (if configured).

### 3. Build & Deploy Settings
Vercel should automatically detect **Vite** and configure the build settings. If it doesn't, ensure they are set to:
- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

### 4. Deploy!
Click **Deploy**. Vercel will build the frontend into `dist/` and automatically package `/api/index.ts` into a scalable Serverless Function.

## Local Development
Run `npm run dev` to start the frontend and backend simultaneously on port `3000`.

## Super Admin store slug editing

In `/admin` → Analytics & Merchants → Registered Merchant Stores, choose **Edit slug**.
Set a strong `SUPER_ADMIN_PASSWORD` in the server environment and enter it in the
editor to authorize a rename. The existing browser gateway PIN does not authorize
this API. The password is sent only with the edit request and is not persisted.
Use HTTPS in production.

`PATCH /api/admin/merchants/:id/slug` accepts `{ store_slug, expected_store_slug }`
and the `X-Admin-Password` header. Slugs are normalized to lowercase and validated
against application routes and existing merchants, including legacy slug aliases.
Concurrent edits return a conflict rather than overwriting a newer slug.

MongoDB must be a replica set (including Atlas) or sharded cluster with transaction
support. The database user needs permission to create unique indexes. Existing
duplicate slugs must be resolved before editing; index failures block the rename.
The transaction updates MongoDB store/merchant aliases and top-level `store_slug`
and `storeSlug` references in the same database. Permanent IDs remain unchanged.
The Supabase store mirror is updated on a best-effort basis, following existing
admin operations; a mirror failure is shown in the portal. Supabase catalog rows
and external links are not migrated. Old slug URLs no longer resolve after a rename.
