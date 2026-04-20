/// <reference lib="deno.ns" />
// deno-lint-ignore no-import-prefix
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// deno-lint-ignore no-import-prefix
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

interface Student {
  id: string
  matric_no: string
  full_name: string
  programme?: string
  level?: number
}

interface Result {
  id: string
  student_id: string
  pdf_url: string
  level?: number
  semester?: number
  is_senate_approved: boolean
  student: Student
}

interface ParentContact {
  student_id: string
  parent_type: string | null
  email: string | null
  telegram_chat_id: string | null
  whatsapp_no: string | null
}

interface DispatchStatus {
  email?: { success: boolean; message?: string; timestamp?: string }
  telegram?: { success: boolean; message?: string; timestamp?: string }
  whatsapp?: { success: boolean; message?: string; timestamp?: string }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// Helper function to get ordinal suffix (st, nd, rd, th)
function getOrdinalSuffix(n: number): string {
  const lastDigit = n % 10
  const lastTwoDigits = n % 100

  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
    return "th"
  }

  switch (lastDigit) {
    case 1:
      return "st"
    case 2:
      return "nd"
    case 3:
      return "rd"
    default:
      return "th"
  }
}

// Helper function to build result details string
function buildResultDetails(student: Student, level?: number, semester?: number): string {
  const parts: string[] = []
  if (student.programme) {
    parts.push(`Programme: ${student.programme}`)
  }
  if (student.level) {
    parts.push(`${student.level}L Student`)
  }
  if (level && level !== student.level) {
    parts.push(`Result: ${level} Level`)
  }
  if (semester) {
    parts.push(`${semester}${getOrdinalSuffix(semester)} Semester`)
  }
  return parts.length > 0 ? ` (${parts.join(', ')})` : ''
}

// Helper function to build result details for HTML
function buildResultDetailsHTML(student: Student, level?: number, semester?: number): string {
  const parts: string[] = []
  if (student.programme) {
    parts.push(`Programme: <strong>${student.programme}</strong>`)
  }
  if (student.level) {
    parts.push(`<strong>${student.level}L Student</strong>`)
  }
  if (level && level !== student.level) {
    parts.push(`Result: <strong>${level} Level</strong>`)
  }
  if (semester) {
    parts.push(`<strong>${semester}${getOrdinalSuffix(semester)} Semester</strong>`)
  }
  return parts.length > 0 ? ` (${parts.join(', ')})` : ''
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    // Get user JWT from Authorization header
    const authHeader = req.headers.get("authorization")
    const userJwt = authHeader?.replace("Bearer ", "")

    if (!userJwt) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Validate user JWT by creating a client with it and checking the user
    const supabaseUserClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${userJwt}`,
        },
      },
    })

    // Verify the JWT is valid by getting the user
    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Use service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { resultId } = await req.json()

    if (!resultId) {
      throw new Error("Missing resultId")
    }

    // Get result with student info
    const { data: result, error: resultError } = await supabase
      .from("results")
      .select(`
        id,
        student_id,
        pdf_url,
        level,
        semester,
        is_senate_approved,
        student:students (id, matric_no, full_name, programme, level)
      `)
      .eq("id", resultId)
      .single()

    if (resultError || !result) {
      throw new Error(`Result not found: ${resultError?.message || 'No data returned'}`)
    }

    // Supabase may return single relationship as object or array
    const studentData = result.student as unknown as Student | Student[]
    const student = Array.isArray(studentData) ? studentData[0] : studentData
    if (!student) {
      throw new Error("Student not found for result")
    }

    // Get all parent contacts for this student (father and mother)
    const { data: parentContacts, error: parentError } = await supabase
      .from("parent_contacts")
      .select("student_id, parent_type, email, telegram_chat_id, whatsapp_no")
      .eq("student_id", result.student_id)

    if (parentError) {
      throw new Error(`Failed to fetch parent contacts: ${parentError.message}`)
    }

    if (!parentContacts || parentContacts.length === 0) {
      throw new Error("No parent contacts found for student")
    }

    const pdfUrl = result.pdf_url as string
    const bucketPath = pdfUrl.split("/result_pdfs/")[1]

    if (!bucketPath) {
      throw new Error("Invalid PDF URL")
    }

    const { data: signedUrlData } = await supabase.storage
      .from("result_pdfs")
      .createSignedUrl(bucketPath, 604800, { download: `${student.matric_no}_result.pdf` })

    const signedUrl = signedUrlData?.signedUrl

    if (!signedUrl) {
      throw new Error("Failed to generate signed URL")
    }

    const status: Record<string, DispatchStatus> = {}
    const timestamp = new Date().toISOString()

    // Process each parent contact
    for (const parentContact of parentContacts) {
      const parentType = parentContact.parent_type || 'parent'
      const parentStatus: DispatchStatus = {}

      // 1. Send via Brevo (if email available)
      if (parentContact.email) {
      try {
        const brevoApiKey = Deno.env.get("BREVO_API_KEY")
        const brevoFromEmail = Deno.env.get("BREVO_FROM_EMAIL") || "noreply@mtu.edu.ng"

        if (brevoApiKey) {
          // Download PDF content for attachment
          const pdfResponse = await fetch(signedUrl)
          if (!pdfResponse.ok) {
            throw new Error("Failed to download PDF for attachment")
          }
          const pdfBuffer = await pdfResponse.arrayBuffer()
          
          // Convert to base64 using chunks to avoid stack overflow
          const uint8Array = new Uint8Array(pdfBuffer)
          const chunks: string[] = []
          const chunkSize = 32768 // Process 32KB at a time
          for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.slice(i, i + chunkSize)
            chunks.push(String.fromCharCode(...chunk))
          }
          const pdfBase64 = btoa(chunks.join(''))
          
          const fileName = bucketPath.split('/').pop() || `${student.matric_no}_result.pdf`

          const resultDetails = buildResultDetails(student, result.level, result.semester)
          const resultDetailsHTML = buildResultDetailsHTML(student, result.level, result.semester)

          const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "api-key": brevoApiKey,
            },
            body: JSON.stringify({
              sender: { email: brevoFromEmail, name: "MTU Senate Results" },
              to: [{ email: parentContact.email }],
              subject: `Result for ${student.full_name}${resultDetails} (${student.matric_no})`,
              textContent: `Dear Parent/Guardian,\n\nPlease find attached the result for ${student.full_name}${resultDetails} (Matric No: ${student.matric_no}).\n\nYou can also download the PDF here: ${signedUrl}\n\nThis link will expire in 7 days.\n\nBest regards,\nMTU Senate`,
              htmlContent: `<p>Dear Parent/Guardian,</p><p>Please find attached the result for <strong>${student.full_name}</strong>${resultDetailsHTML} (Matric No: <strong>${student.matric_no}</strong>).</p><p>You can also <a href="${signedUrl}">download the PDF here</a>.</p><p><em>This link will expire in 7 days.</em></p><p>Best regards,<br>MTU Senate</p>`,
              attachment: [
                {
                  content: pdfBase64,
                  name: fileName,
                  type: "application/pdf",
                },
              ],
            }),
          })

          let emailMessage = "Email sent with attachment"
          if (!emailResponse.ok) {
            const errorBody = await emailResponse.text()
            console.error("[process-dispatch] Brevo error:", emailResponse.status, errorBody)
            emailMessage = `Email failed: ${emailResponse.status} - ${errorBody}`
          }

          parentStatus.email = {
            success: emailResponse.ok,
            message: emailMessage,
            timestamp,
          }
        } else {
          parentStatus.email = {
            success: false,
            message: "Brevo not configured",
            timestamp,
          }
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e)
        parentStatus.email = {
          success: false,
          message: errorMessage,
          timestamp,
        }
      }
    }

      // 2. Send via Telegram Bot
      const telegramChatId = parentContact.telegram_chat_id
      if (telegramChatId) {
      try {
        const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN")

        if (telegramBotToken) {
          // Download PDF content for upload
          const pdfResponse = await fetch(signedUrl)
          if (!pdfResponse.ok) {
            throw new Error("Failed to download PDF for Telegram upload")
          }
          const pdfBuffer = await pdfResponse.arrayBuffer()
          const fileName = bucketPath.split('/').pop() || `${student.matric_no}_result.pdf`

          // Create File object with explicit PDF MIME type
          const pdfFile = new File([pdfBuffer], fileName, { type: "application/pdf" })

          // Build Telegram caption with programme, student level, result level, and semester
          const telegramDetails: string[] = []
          if (student.programme) telegramDetails.push(`📚 Programme: ${student.programme}`)
          if (student.level) telegramDetails.push(`🎓 Student: ${student.level}L`)
          if (result.level && result.level !== student.level) telegramDetails.push(`📊 Result: ${result.level}L`)
          if (result.semester) telegramDetails.push(`📅 Semester: ${result.semester}${getOrdinalSuffix(result.semester)}`)

          // Create multipart form data - standard Telegram sendDocument
          const formData = new FormData()
          formData.append("chat_id", telegramChatId)
          formData.append("caption", `📄 <b>Result for ${student.full_name}</b>\n🆔 Matric: <code>${student.matric_no}</code>${telegramDetails.length > 0 ? '\n' + telegramDetails.join('\n') : ''}\n\n⬇️ <a href="${signedUrl}">Download PDF</a>\n\n<em>Link expires in 7 days</em>`)
          formData.append("parse_mode", "HTML")
          formData.append("document", pdfFile)

          const telegramResponse = await fetch(
            `https://api.telegram.org/bot${telegramBotToken}/sendDocument`,
            {
              method: "POST",
              body: formData,
            }
          )

          const telegramData = await telegramResponse.json()

          parentStatus.telegram = {
            success: telegramResponse.ok && telegramData.ok,
            message: telegramData.ok ? "Telegram sent" : `Telegram failed: ${telegramData.description || 'Unknown error'}`,
            timestamp,
          }
        } else {
          parentStatus.telegram = {
            success: false,
            message: "Telegram bot not configured",
            timestamp,
          }
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e)
        parentStatus.telegram = {
          success: false,
          message: errorMessage,
          timestamp,
        }
      }
    }

      // 3. Send via Green API WhatsApp (if whatsapp_no available)
      const parent = parentContact as ParentContact
      const whatsappNo = parent.whatsapp_no
      if (whatsappNo) {
      try {
        const greenApiInstance = Deno.env.get("GREENAPI_INSTANCE_ID")
        const greenApiToken = Deno.env.get("GREENAPI_API_TOKEN")

        if (greenApiInstance && greenApiToken) {
          // Format phone number (remove + and any non-digits)
          const formattedPhone = whatsappNo.replace(/\D/g, '')
          const chatId = `${formattedPhone}@c.us`

          // Download PDF content for upload
          const pdfResponse = await fetch(signedUrl)
          if (!pdfResponse.ok) {
            throw new Error("Failed to download PDF for WhatsApp upload")
          }
          const pdfBuffer = await pdfResponse.arrayBuffer()
          const fileName = bucketPath.split('/').pop() || `${student.matric_no}_result.pdf`

          // Build WhatsApp caption with programme, student level, result level, and semester
          const whatsappDetails: string[] = []
          if (student.programme) whatsappDetails.push(`📚 Programme: ${student.programme}`)
          if (student.level) whatsappDetails.push(`🎓 Student: ${student.level}L`)
          if (result.level && result.level !== student.level) whatsappDetails.push(`📊 Result: ${result.level}L`)
          if (result.semester) whatsappDetails.push(`📅 Semester: ${result.semester}${getOrdinalSuffix(result.semester)}`)

          // Upload PDF to Green API first, then send
          const caption = `📄 *Result for ${student.full_name}*\n🆔 Matric: ${student.matric_no}${whatsappDetails.length > 0 ? '\n' + whatsappDetails.join('\n') : ''}\n\nDownload the PDF here (link expires in 7 days): ${signedUrl}`

          // Green API file upload endpoint
          const uploadUrl = `https://api.green-api.com/waInstance${greenApiInstance}/sendFileByUpload/${greenApiToken}`

          // Create form data for file upload
          const formData = new FormData()
          formData.append("chatId", chatId)
          formData.append("caption", caption)
          formData.append("fileName", fileName)
          formData.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), fileName)

          const greenApiResponse = await fetch(uploadUrl, {
            method: "POST",
            body: formData,
          })

          const greenApiData = await greenApiResponse.json()

          parentStatus.whatsapp = {
            success: greenApiResponse.ok && greenApiData.idMessage,
            message: greenApiData.error || (greenApiData.idMessage ? "PDF sent via WhatsApp" : "WhatsApp upload failed"),
            timestamp,
          }
        } else {
          parentStatus.whatsapp = {
            success: false,
            message: "Green API not configured",
            timestamp,
          }
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e)
        console.error("[process-dispatch] Green API error:", e)
        parentStatus.whatsapp = {
          success: false,
          message: errorMessage,
          timestamp,
        }
      }
    }

      // Store status for this parent
      status[parentType] = parentStatus
    }

    // Update dispatch status
    const { error: updateError } = await supabase
      .from("results")
      .update({ dispatch_status: status, updated_at: new Date().toISOString() })
      .eq("id", resultId)

    if (updateError) {
      throw new Error("Failed to update dispatch status")
    }

    return new Response(JSON.stringify({ success: true, status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error("[process-dispatch] Error:", error)
    return new Response(JSON.stringify({ 
      error: errorMessage,
      stack: errorStack 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})