export type AssistantIntent =
  | 'navigate_dashboard'
  | 'navigate_leads'
  | 'navigate_listings'
  | 'navigate_transactions'
  | 'navigate_calendar'
  | 'navigate_actions'
  | 'open_lead_detail'
  | 'open_property_detail'
  | 'open_transaction_detail'
  | 'highlight_top_lead'
  | 'highlight_urgent_task'
  | 'explain_action'
  | 'send_email'
  | 'send_text_message'
  | 'general_question'
  | 'clarification_request'

export type AssistantStatus =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'navigating'
  | 'speaking'
  | 'error'

export type AssistantRequest = {
  message: string
  currentPath: string
  recentExecutedActionIds?: string[]
}

export type AssistantDecision = {
  intent: AssistantIntent
  targetRoute: string | null
  targetId: string | null
  highlight: boolean
  voiceResponse: string
  confidence: number
  clarificationQuestion: string | null
  communication: AssistantCommunication | null
}

export type AssistantCommunication = {
  channel: 'email' | 'sms'
  leadId: string
  recipientName: string
  recipientEmail: string | null
  recipientPhone: string | null
  subject: string | null
  body: string
  deliveryStatus: 'pending' | 'prepared' | 'sent' | 'failed'
  messageId: string | null
  launchHref: string | null
  error: string | null
}

export type AssistantChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}
