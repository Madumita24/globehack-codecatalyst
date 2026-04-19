export type ActionType =
  | 'call'
  | 'text'
  | 'email'
  | 'send_listing'
  | 'review_transaction'
  | 'schedule_followup'

export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical'

export type ActionStatus = 'pending' | 'in_progress' | 'done' | 'snoozed'

export type RecommendedAction = {
  id: string
  type: ActionType
  title: string
  summary: string
  leadId?: string
  propertyId?: string
  transactionId?: string
  priorityScore: number
  urgency: UrgencyLevel
  confidence: number
  reasons: string[]
  consequenceIfIgnored?: string
  status: ActionStatus
  draftMessage?: string
  scheduledFor?: string
}

export type Transaction = {
  id: string
  address: string
  stage: 'offer' | 'inspection' | 'appraisal' | 'closing' | 'closed'
  closingDate: string
  nextDeadline: string
  nextDeadlineLabel: string
  leadId: string
  agentName: string
  salePrice: number
  daysUntilDeadline: number
}

export type Task = {
  id: string
  type: 'call' | 'text' | 'email' | 'other'
  title: string
  leadId?: string
  dueTime?: string
  scheduledFor?: string
  completed: boolean
}
