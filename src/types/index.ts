export interface Student {
  id: string
  matric_no: string
  full_name: string
  programme?: string // e.g., B.Sc. Computer Science, B.Eng. Electrical Engineering
  level?: number // e.g., 100, 200, 300, 400, 500
}

export interface ParentContact {
  id: string
  student_id: string
  parent_type: 'father' | 'mother'
  email: string
  telegram_chat_id: string | null
  whatsapp_no: string | null
}

export interface DispatchStatus {
  email?: { success: boolean; message?: string; timestamp?: string }
  telegram?: { success: boolean; message?: string; timestamp?: string }
  whatsapp?: { success: boolean; message?: string; timestamp?: string }
}

export interface Result {
  id: string
  student_id: string
  student?: Student
  parent_contact?: ParentContact
  pdf_url: string
  level?: number // e.g., 100, 200, 300, 400, 500
  semester?: number // e.g., 1 or 2
  session?: string // e.g., "2023/2024", "2024/2025"
  result_type?: 'regular' | 'supplementary' // Type of result (regular or supplementary/resit)
  cgpa?: number // e.g., 4.50, 3.75
  is_senate_approved: boolean
  dispatch_status: DispatchStatus | null
  created_at: string
  updated_at: string
}

export interface ResultWithDetails extends Result {
  full_name?: string
  matric_no?: string
}

export interface Staff {
  id: string
  user_id: string
  email: string
  full_name: string | null
  role: 'admin' | 'staff'
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Invite {
  id: string
  email: string
  token: string
  role: 'admin' | 'staff'
  created_by: string | null
  created_at: string
  expires_at: string
  used_at: string | null
}