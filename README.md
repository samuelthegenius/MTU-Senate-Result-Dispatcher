# MTU Senate Result Dispatcher

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env` file with Supabase credentials:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. **Prerequisites:**
   - Enable `pg_net` extension in Supabase (needed for async dispatch triggers)
     ```sql
     CREATE EXTENSION IF NOT EXISTS pg_net;
     ```

4. Set up Supabase:
   - Run `supabase/schema.sql` in Supabase SQL Editor
   - Run `supabase/telegram_bot_schema.sql` for Telegram bot columns
   - Run `supabase/cleanup_functions.sql` for PDF cleanup triggers
   - Run migration files in `supabase/migrations/` folder:
     - `add_parent_type.sql` - adds parent_type to parent_contacts
     - `add_portal_integration.sql` - adds portal sync tables and config
     - `add_portal_helpers.sql` - helper functions for portal integration
     - `add_results_level_semester.sql` - adds level/semester columns
     - `add_student_course_level.sql` - adds course/level to students
     - `rename_course_to_programme.sql` - renames course column
     - `add_cron_job.sql` - sets up pg_cron scheduled sync (optional)
     - `fix_duplicate_portal_config.sql` - enforces single row constraint on portal_config
   - Configure storage bucket `result_pdfs`
   - Deploy all Edge Functions:
     ```bash
     supabase functions deploy process-dispatch
     supabase functions deploy telegram-webhook
     supabase functions deploy fetch-portal-data
     supabase functions deploy cleanup-storage
     supabase functions deploy scheduled-portal-sync
     ```

5. **Troubleshooting (if needed):**
   - If you get RLS recursion errors on staff table, run `supabase/fix_recursion.sql`
   - If you get 400 errors on result approval, run `supabase/fix_results_trigger.sql`

6. Start development server:
   ```bash
   npm run dev
   ```

## Environment Variables Required

### Frontend (`.env`)
- `VITE_SUPABASE_URL` - your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - your Supabase anonymous key
- `VITE_TELEGRAM_BOT_USERNAME` - your Telegram bot username (without @)

### Backend (Supabase Edge Function Secrets)
- `SUPABASE_URL` - your Supabase project URL (same as VITE_SUPABASE_URL)
- `SUPABASE_SERVICE_ROLE_KEY` - your Supabase service role key (for admin operations)
- `BREVO_API_KEY` - for email via Brevo (300 emails/day free, forever)
- `BREVO_FROM_EMAIL` - sender email address to display
- `TELEGRAM_BOT_TOKEN` - for Telegram bot (completely free)
- `TELEGRAM_WEBHOOK_SECRET` - random secret to validate Telegram webhook requests
- `GREENAPI_INSTANCE_ID` - Green API instance ID for WhatsApp
- `GREENAPI_API_TOKEN` - Green API token for WhatsApp
- `PORTAL_ENCRYPTION_KEY` - strong 32+ character key for encrypting portal credentials
- `CRON_SECRET` - secret key for authenticating scheduled sync calls (any random string)

### CORS Configuration
- `ALLOWED_ORIGINS` - comma-separated list of allowed origins (defaults to localhost)

## Brevo Setup

1. Sign up at [brevo.com](https://brevo.com) (no credit card required)
2. Get your API key from **API Keys** in the dashboard
3. Add to your Supabase Edge Function secrets:
   ```bash
   supabase secrets set BREVO_API_KEY=xkeysib-xxxxxxxx
   supabase secrets set BREVO_FROM_EMAIL=noreply@mtu.edu.ng
   ```
4. Brevo free tier works immediately - no domain verification needed!

## Features

- Auth guard restricts login to @mtu.edu.ng emails
- Drag-and-drop PDF upload with filename parsing (format: 19010301081_S2.pdf)
- Bulk senate approval with dispatch trigger
- Delivery tracking icons for Email and Telegram
- **Portal Integration** - Automatically fetch results from MTU student portal
- **Scheduled Sync** - Automated result fetching via cron jobs
- **Auto-dispatch** - Send results to parents immediately when synced from portal
- **Storage Cleanup** - Automatic PDF cleanup when results are deleted

## Portal Integration (MTU Student Portal Sync)

The system can automatically fetch student results from the MTU student portal (`studentportal.mtu.edu.ng`) and dispatch them to parents without manual intervention.

### Portal Setup

1. Configure portal credentials in the app:
   - Go to **Settings > Portal Configuration** in the UI
   - Enter portal base URL (`https://studentportal.mtu.edu.ng`)
   - Enter API endpoint (`/api/results`)
   - Provide portal login credentials (encrypted before storage)
   - Enable sync and auto-dispatch as needed

2. Run the `add_portal_integration.sql` and `add_portal_helpers.sql` migrations

3. Set `CRON_SECRET` for scheduled sync authentication:
   ```bash
   supabase secrets set CRON_SECRET=your_random_secret_key
   ```

4. Set up scheduled sync (choose one method):

   **Option A: pg_cron (Recommended - works on free tier)**
   
   Run the `add_cron_job.sql` migration in Supabase SQL Editor:
   - Copy the contents of `supabase/migrations/add_cron_job.sql`
   - Paste into Supabase Dashboard → SQL Editor → New Query
   - Run the query
   
   This creates a job that runs every 30 minutes. You can verify with:
   ```sql
   SELECT * FROM cron.job;
   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
   ```
   
   You can also manage jobs via Supabase Dashboard: **Integrations → Cron**

   **Option B: External cron service** (e.g., cron-job.org, UptimeRobot)
   - URL: `https://<your-project>.supabase.co/functions/v1/scheduled-portal-sync`
   - Method: POST
   - Header: `x-cron-secret: your_random_secret_key`
   - Schedule: Every 30-60 minutes

### Portal Sync Features

- **Manual Sync**: Trigger from UI at any time
- **Auto-sync**: Scheduled automatic fetching
- **Auto-dispatch**: Results sent immediately when fetched and approved
- **Sync Logging**: All operations tracked in `portal_sync_logs` table
- **Credential Encryption**: Portal credentials encrypted at rest

### Edge Functions

| Function | Purpose |
|----------|---------|
| `fetch-portal-data` | Fetch students and results from MTU portal |
| `scheduled-portal-sync` | Cron-triggered sync with authentication |
| `cleanup-storage` | Remove orphaned PDFs from storage |
| `process-dispatch` | Send results via Email/Telegram/WhatsApp |
| `telegram-webhook` | Handle Telegram bot interactions |

## Telegram Bot Setup

1. Create a bot via [@BotFather](https://t.me/BotFather) and get your bot token and username

2. Add to `.env`:
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token
   VITE_TELEGRAM_BOT_USERNAME=your_bot_username_without_@
   ```

3. Deploy the webhook Edge Function:
   ```bash
   supabase functions deploy telegram-webhook
   supabase secrets set TELEGRAM_BOT_TOKEN=your_bot_token
   ```

4. Set the webhook URL:
   ```
   https://api.telegram.org/bot<TOKEN>/setWebhook?url=<SUPABASE_FUNCTION_URL>/telegram-webhook
   ```

5. Parent onboarding:
   - Staff copies deep link from Parents page (e.g., `https://t.me/mtubot?start=abc123`)
   - Sends to parent via any channel
   - Parent clicks link → bot opens → tap **Start** → auto-linked
   - `telegram_chat_id` is automatically populated in database

6. Alternative (manual link):
   - Parent sends `/start` to bot without token
   - Taps **Verify My Phone Number** button
   - Bot matches phone number to parent record
   - `telegram_chat_id` is automatically populated

7. **Changed Telegram Account?**
   - Parent sends `/start` to the bot from their new account
   - Verifies phone number via contact sharing
   - New `telegram_chat_id` replaces the old one automatically
   - Old account stops receiving notifications
   - Or: Staff can re-send the same deep link, parent opens it on new account

## WhatsApp Setup (Green API)

1. Sign up at [green-api.com](https://green-api.com) (free tier available)
2. Create an instance and get your `Instance ID` and `ApiToken`
3. Link your WhatsApp by scanning the QR code in your Green API dashboard
4. Add to your Supabase Edge Function secrets:
   ```bash
   supabase secrets set GREENAPI_INSTANCE_ID=your_instance_id
   supabase secrets set GREENAPI_API_TOKEN=your_api_token
   ```
5. Parent's WhatsApp number should be stored in `parent_contacts.whatsapp_no` field
