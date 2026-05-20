import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Allowed origins for CORS - supports local dev and production
const getAllowedOrigins = (): string[] => {
  const envOrigins = Deno.env.get("ALLOWED_ORIGINS")
  if (envOrigins) {
    return envOrigins.split(",").map(o => o.trim()).filter(Boolean)
  }
  // Default origins if not configured
  return [
    "http://localhost:5173",
    "https://mturesults.app",
    "https://www.mturesults.app",
  ]
}

const getCorsHeaders = (req: Request): Record<string, string> => {
  const allowedOrigins = getAllowedOrigins()
  const origin = req.headers.get("origin")
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : null

  return {
    ...(allowOrigin ? { "Access-Control-Allow-Origin": allowOrigin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

interface TelegramUpdate {
  message?: {
    message_id: number
    from: {
      id: number
      first_name: string
      last_name?: string
      username?: string
    }
    chat: {
      id: number
      type: string
    }
    date: number
    text?: string
    contact?: {
      phone_number: string
      first_name: string
      last_name?: string
      user_id?: number
    }
    entities?: Array<{
      type: string
      offset: number
      length: number
    }>
  }
}

interface Student {
  full_name: string
  matric_no: string
}

interface ParentContact {
  id: string
  student_id: string
  parent_type: 'father' | 'mother'
  email: string | null
  phone: string | null
  whatsapp_no: string | null
  telegram_chat_id: string | null
  verification_token: string | null
  student: Student[] | null
}

interface TelegramMessageBody {
  chat_id: number
  text: string
  parse_mode: "HTML" | "Markdown" | "MarkdownV2"
  reply_markup?: {
    keyboard?: Array<Array<{ text: string; request_contact?: boolean }>>
    one_time_keyboard?: boolean
    resize_keyboard?: boolean
    remove_keyboard?: boolean
  }
}

// Set up bot menu commands
async function setupBotCommands(botToken: string): Promise<void> {
  const commands = [
    { command: "start", description: "Start the bot and verify/link your account" },
    { command: "status", description: "Check your account status" },
    { command: "help", description: "Get help and information" },
  ]

  const response = await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      commands,
      scope: { type: "default" },
    }),
  })

  if (!response.ok) {
    // Failed to set bot commands - continue silently
  }
}

// Initialize bot commands on startup
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")
if (TELEGRAM_BOT_TOKEN) {
  setupBotCommands(TELEGRAM_BOT_TOKEN).catch(() => {
    // Bot command setup failed - continue silently
  })
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!
    const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET")

    if (!telegramBotToken) {
      throw new Error("TELEGRAM_BOT_TOKEN not configured")
    }

    // Validate webhook secret to protect against fake/forged webhook requests.
    // TELEGRAM_WEBHOOK_SECRET must be configured — reject all requests if not set.
    if (!webhookSecret) {
      return new Response(JSON.stringify({ error: "Webhook not configured" }), {
        status: 503,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      })
    }

    const requestSecret = req.headers.get("X-Telegram-Bot-Api-Secret-Token")
    if (requestSecret !== webhookSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const update: TelegramUpdate = await req.json()
    const message = update.message

    if (!message) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      })
    }

    const chatId = message.chat.id
    const text = message.text || ""

    // Handle /start command with optional token
    if (text.startsWith("/start")) {
      const parts = text.split(" ")
      const token = parts.length > 1 ? parts[1] : null

      // Check if this Telegram account is already linked (unless using deep link)
      if (!token) {
        const { data: existingContact } = await supabase
          .from("parent_contacts")
          .select(`
            id,
            telegram_chat_id,
            student:student_id (full_name, matric_no)
          `)
          .eq("telegram_chat_id", chatId.toString())
          .single()

        if (existingContact) {
          const studentName = existingContact.student?.[0]?.full_name || "your child"
          await sendTelegramMessage(
            telegramBotToken,
            chatId,
            `✅ Your account is already linked!

You are set up to receive results for <b>${studentName}</b>.

<b>/status</b> - Check your account details
<b>/help</b> - Get help and information`
          )
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          })
        }
      }

      if (token) {
        // Deep link flow: /start [token]
        const { data: parentContact, error } = await supabase
          .from("parent_contacts")
          .select(`
            id,
            student_id,
            parent_type,
            email,
            phone,
            whatsapp_no,
            telegram_chat_id,
            verification_token,
            student:student_id (full_name, matric_no)
          `)
          .eq("verification_token", token)
          .single()

        if (error || !parentContact) {
          await sendTelegramMessage(
            telegramBotToken,
            chatId,
            "Invalid or expired verification token. Please contact the school administration for assistance."
          )
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          })
        }

        // Check if there's already a different telegram_chat_id linked
        const hadPreviousChatId = parentContact.telegram_chat_id &&
                                 parentContact.telegram_chat_id !== chatId.toString()

        // Update the parent contact with telegram_chat_id
        const { error: updateError } = await supabase
          .from("parent_contacts")
          .update({
            telegram_chat_id: chatId.toString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", parentContact.id)

        if (updateError) {
          await sendTelegramMessage(
            telegramBotToken,
            chatId,
            "An error occurred while linking your account. Please try again later."
          )
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          })
        }

        // Send success message
        const parentName = message.from.first_name
        const studentName = parentContact.student?.[0]?.full_name || "your child"

        let welcomeMessage: string
        if (hadPreviousChatId) {
          welcomeMessage = `Welcome ${parentName}! Your account has been moved to this Telegram account. Your old account will no longer receive notifications. You will now receive results for ${studentName} here.`
        } else {
          welcomeMessage = `Welcome ${parentName}! You will now receive results for ${studentName} here. You'll be notified when new results are available.`
        }

        await sendTelegramMessage(
          telegramBotToken,
          chatId,
          welcomeMessage
        )
      } else {
        // Manual start flow: No token provided
        const keyboard = {
          keyboard: [
            [
              {
                text: "Verify My Phone Number",
                request_contact: true,
              }
            ],
            [
              {
                text: "Exit",
              }
            ]
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        }

        await sendTelegramMessageWithKeyboard(
          telegramBotToken,
          chatId,
          "Welcome to the MTU Result Service. Please click the button below to verify your phone number and link your account, or tap Exit to cancel.",
          keyboard
        )
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      })
    }

    // Handle /help command
    if (text === "/help") {
      await sendTelegramMessage(
        telegramBotToken,
        chatId,
        "<b>MTU Result Service - Help</b>\n\n" +
        "<b>/start</b> - Link or update your account\n" +
        "<b>/status</b> - Check if your account is linked\n" +
        "<b>/help</b> - Show this help message\n\n" +
        "To receive results:\n" +
        "1. Send /start to the bot\n" +
        "2. Verify your phone number\n" +
        "3. Or use a deep link from the school\n\n" +
        "<b>Changed your Telegram account?</b>\n" +
        "Just send /start again and verify your phone number."
      )
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      })
    }

    // Handle /status command
    if (text === "/status") {
      const { data: parentContact, error } = await supabase
        .from("parent_contacts")
        .select(`
          id,
          telegram_chat_id,
          student:student_id (full_name, matric_no)
        `)
        .eq("telegram_chat_id", chatId.toString())
        .single()

      if (error || !parentContact) {
        await sendTelegramMessage(
          telegramBotToken,
          chatId,
          "Your account is not yet linked. Send /start to begin verification."
        )
      } else {
        const studentName = parentContact.student?.[0]?.full_name || "your child"
        await sendTelegramMessage(
          telegramBotToken,
          chatId,
          `✅ Your account is active and linked!\n\nYou will receive results for ${studentName} here.`
        )
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      })
    }

    // Handle contact sharing
    if (message.contact) {
      const phoneRaw = message.contact.phone_number
      const phoneDigits = phoneRaw.replace(/\D/g, "")

      const intlDigits = phoneDigits.startsWith("0")
        ? "234" + phoneDigits.substring(1)
        : phoneDigits

      const localDigits = phoneDigits.startsWith("234")
        ? "0" + phoneDigits.substring(3)
        : phoneDigits

      const digitPatterns = [...new Set([intlDigits, localDigits])]

      // DEBUG: log what we received and what we're searching for
      console.log("[DEBUG] Contact shared. phoneRaw:", phoneRaw)
      console.log("[DEBUG] phoneDigits:", phoneDigits)
      console.log("[DEBUG] digitPatterns:", JSON.stringify(digitPatterns))

      const selectFields = "id, student_id, parent_type, email, phone, whatsapp_no, telegram_chat_id, verification_token, student:student_id(full_name, matric_no)"

      let parentContact: ParentContact | null = null

      for (const digits of digitPatterns) {
        for (const column of ["phone", "whatsapp_no"]) {
          const { data, error } = await supabase
            .from("parent_contacts")
            .select(selectFields)
            .ilike(column, `%${digits}%`)
            .limit(1)

          console.log(`[DEBUG] ilike ${column} %${digits}%:`, JSON.stringify(data), "error:", JSON.stringify(error))

          if (data && data.length > 0) {
            parentContact = data[0] as ParentContact
            break
          }
        }
        if (parentContact) break
      }

      if (!parentContact) {
        await sendTelegramMessage(
          telegramBotToken,
          chatId,
          "We couldn't find an account associated with this phone number. Please ensure your phone number is registered with the school, or contact the administration for assistance."
        )
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        })
      }

      // Check if there's already a different telegram_chat_id linked
      const hadPreviousChatId = parentContact.telegram_chat_id &&
                               parentContact.telegram_chat_id !== chatId.toString()

      // Update the parent contact with telegram_chat_id
      const { error: updateError } = await supabase
        .from("parent_contacts")
        .update({
          telegram_chat_id: chatId.toString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", parentContact.id)

      if (updateError) {
        await sendTelegramMessage(
          telegramBotToken,
          chatId,
          "An error occurred while linking your account. Please try again later."
        )
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        })
      }

      // Send success message
      const parentName = message.from.first_name
      const studentName = parentContact.student?.[0]?.full_name || "your child"

      let successMessage: string
      if (hadPreviousChatId) {
        successMessage = `Thank you ${parentName}! Your new Telegram account has been linked. Your old account will no longer receive notifications. You will now receive results for ${studentName} on this account.`
      } else {
        successMessage = `Thank you ${parentName}! Your phone number has been verified. You will now receive results for ${studentName} here. You'll be notified when new results are available.`
      }

      await sendTelegramMessage(
        telegramBotToken,
        chatId,
        successMessage,
        { remove_keyboard: true }
      )

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      })
    }

    // Handle Exit button
    if (text === "Exit") {
      await sendTelegramMessage(
        telegramBotToken,
        chatId,
        "Okay! You can verify your phone number anytime by sending /start again.",
        { remove_keyboard: true }
      )
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      })
    }

    // Handle unknown messages
    await sendTelegramMessage(
      telegramBotToken,
      chatId,
      "I don't understand that command. Send /start to begin, or use the contact button to verify your account."
    )

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    })
  } catch {
    return new Response(JSON.stringify({ error: "Webhook processing failed" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    })
  }
})

// Helper function to send a simple text message
async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  options: { remove_keyboard?: boolean } = {}
): Promise<void> {
  const body: TelegramMessageBody = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  }

  if (options.remove_keyboard) {
    body.reply_markup = { remove_keyboard: true }
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(`Telegram API error: ${errorData.description}`)
  }
}

// Helper function to send a message with a custom keyboard
async function sendTelegramMessageWithKeyboard(
  botToken: string,
  chatId: number,
  text: string,
  keyboard: object
): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: keyboard,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(`Telegram API error: ${errorData.description}`)
  }
}
