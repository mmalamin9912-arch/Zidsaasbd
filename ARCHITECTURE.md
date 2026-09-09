# Project Architecture Rules

1. **Database Strategy:**
   - Store configs & Authentication: Supabase
   - Operational High-Traffic Data (Orders & Products): MongoDB Atlas
   - Unified Store Identifier: `store_id` (Format: ZID-BD-XXXX)

2. **AI Agent Constraints:**
   - Always modify files directly in the `main` workspace.
   - NEVER create new Git branches or Worktrees.
   - Do NOT rewrite working database queries or change existing interfaces.