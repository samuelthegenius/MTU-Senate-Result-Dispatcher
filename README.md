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

3. Set up Supabase:
   - Run `supabase/schema.sql` in Supabase SQL Editor
   - Run `supabase/telegram_bot_schema.sql` for Telegram bot columns
   - Configure storage bucket `result_pdfs`
   - Deploy Edge Function `supabase/functions/process-dispatch.ts`
   - Deploy Edge Function `supabase/functions/telegram-webhook.ts`

4. Start development server:
   ```bash
   npm run dev
   ```

## Environment Variables Required

- `BREVO_API_KEY` - for email via Brevo (300 emails/day free, forever)
- `BREVO_FROM_EMAIL` - sender email address to display
- `TELEGRAM_BOT_TOKEN` - for Telegram bot (completely free)

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
   - **Option A:** Parent sends `/relink` to the bot from their new account → verifies phone number
   - **Option B:** Staff can send the same deep link again, parent opens it on new account
   - New `telegram_chat_id` replaces the old one
   - Old account stops receiving notifications
   - Parent receives confirmation of the account change
