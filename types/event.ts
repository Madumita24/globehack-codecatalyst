export type EventType =
  | 'listing_view'
  | 'listing_save'
  | 'mortgage_calc_used'
  | 'showing_request'
  | 'back_to_site'
  | 'valuation_request'
  | 'email_opened'
  | 'email_replied'
  | 'call_completed'
  | 'document_signed'
  | 'search_refined'
  | 'price_drop_alert_opened'
  | 'virtual_tour_requested'
  | 'pre_approval_uploaded'

export type LeadEvent = {
  id: string
  leadId: string
  type: EventType
  description: string
  occurredAt: string // ISO 8601 datetime
  propertyId?: string
  metadata?: Record<string, string | number | boolean>
}
