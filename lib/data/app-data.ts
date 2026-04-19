import 'server-only'

import {
  mockAppointments,
  mockEvents,
  mockLeads,
  mockProperties,
  mockTasks,
  mockTransactions,
} from '@/lib/mock-data'
import { generateRecommendedActions } from '@/lib/scoring'
import { scanTable } from '@/lib/data/dynamodb'
import type { AppData } from '@/types/app-data'
import type { RecommendedAction, Task } from '@/types/action'
import type { EventType, LeadEvent } from '@/types/event'
import type { EngagementLevel, Lead, LeadStage } from '@/types/lead'
import type { Property, PropertyStatus } from '@/types/property'

type RawItem = Record<string, unknown>

const DEMO_NOW = new Date('2026-04-18T12:00:00Z').getTime()

export async function getAppData(): Promise<AppData> {
  try {
    const [peopleItems, propertyItems, eventItems, actionItems] = await Promise.all([
      scanTable<RawItem>(process.env.DDB_PEOPLE_TABLE),
      scanTable<RawItem>(process.env.DDB_PROPERTIES_TABLE),
      scanTable<RawItem>(process.env.DDB_EVENTS_TABLE),
      scanTable<RawItem>(process.env.DDB_ACTIONS_TABLE),
    ])

    const leads = peopleItems.map(mapPerson).filter(Boolean) as Lead[]
    const properties = propertyItems.map(mapProperty).filter(Boolean) as Property[]
    const events = eventItems.map((item) => mapEvent(item, leads)).filter(Boolean) as LeadEvent[]
    const dbActions = actionItems.map(mapAction).filter(Boolean) as RecommendedAction[]
    const dbTasks = actionItems.map(mapTask).filter(Boolean) as Task[]

    const resolvedLeads = leads.length > 0 ? leads : mockLeads
    const resolvedProperties = properties.length > 0 ? properties : mockProperties
    const resolvedEvents = events.length > 0 ? events : mockEvents
    const resolvedTransactions = mockTransactions
    const generatedActions = generateRecommendedActions(
      resolvedLeads,
      resolvedProperties,
      resolvedEvents,
      resolvedTransactions,
    )

    return {
      leads: resolvedLeads,
      properties: resolvedProperties,
      events: resolvedEvents,
      transactions: resolvedTransactions,
      tasks: dbTasks.length > 0 ? dbTasks : mockTasks,
      appointments: mockAppointments,
      actions: dbActions.length > 0 ? sortActions(dbActions) : generatedActions,
      source: peopleItems.length || propertyItems.length || eventItems.length || actionItems.length ? 'dynamodb' : 'mock',
    }
  } catch (error) {
    console.error('[AppData] Falling back to mock data:', error)
    return getMockAppData()
  }
}

export function getMockAppData(): AppData {
  return {
    leads: mockLeads,
    properties: mockProperties,
    events: mockEvents,
    transactions: mockTransactions,
    tasks: mockTasks,
    appointments: mockAppointments,
    actions: generateRecommendedActions(mockLeads, mockProperties, mockEvents, mockTransactions),
    source: 'mock',
  }
}

function mapPerson(item: RawItem): Lead | null {
  const raw = parsePossiblyNestedPerson(item)
  const id = stringValue(raw.personId) || stringValue(item.personId) || stringValue(raw.id)
  const name = stringValue(raw.fullName) || stringValue(raw.name)
  if (!id || !name) return null

  const tags = stringArray(raw.tags)
  const stage = normalizeLeadStage(raw.stage)
  const score = numberValue(raw.leadScore, numberValue(raw.score, stage === 'hot' ? 82 : 60))
  const recentBehavior = buildRecentBehavior(raw, tags)

  return {
    id,
    name,
    email: stringValue(raw.email) || 'unknown@example.com',
    phone: stringValue(raw.phone) || '(000) 000-0000',
    stage,
    score,
    budget: numberValue(raw.budget, stage === 'hot' ? 900000 : 750000),
    preferredAreas: preferredAreasFrom(raw, tags),
    preferences: {
      minBeds: numberValue(raw.minBeds, 2),
      maxBeds: numberValue(raw.maxBeds, 4),
      minBaths: numberValue(raw.minBaths, 2),
      propertyTypes: stringArray(raw.propertyTypes, ['Single Family', 'Condo']),
    },
    lastContactDaysAgo: daysAgo(stringValue(raw.lastTouchAt) || stringValue(raw.updatedAt)),
    recentBehavior,
    intentSignals: intentSignalsFrom(raw, tags, stage),
    assignedAgent: stringValue(raw.assignedAgent) || 'James Carter',
    source: stringValue(raw.source) || stringValue(raw.pipeline) || 'DynamoDB',
    engagementLevel: engagementFromScore(score),
  }
}

function parsePossiblyNestedPerson(item: RawItem): RawItem {
  const personId = item.personId
  if (typeof personId === 'string' && personId.trim().startsWith('{')) {
    try {
      return JSON.parse(personId) as RawItem
    } catch {
      return item
    }
  }
  return item
}

function mapProperty(item: RawItem): Property | null {
  const pk = stringValue(item.pk)
  const id = stringValue(item.propertyId) || pk.replace(/^PROPERTY#/, '') || stringValue(item.id)
  const address = stringValue(item.address)
  if (!id || !address) return null

  const parsed = parseAddress(address)
  const propertyType = stringValue(item.type)

  return {
    id,
    address: parsed.street,
    city: stringValue(item.city) || parsed.city,
    state: stringValue(item.state) || parsed.state,
    zip: stringValue(item.zip) || parsed.zip,
    price: numberValue(item.price, 0),
    beds: numberValue(item.beds, 0),
    baths: numberValue(item.baths, 0),
    sqft: numberValue(item.sqft, 0),
    tags: stringArray(item.tags, propertyType ? [propertyType] : []),
    status: normalizePropertyStatus(item.status),
    daysOnMarket: numberValue(item.daysOnMarket, 0),
    imageUrl: stringValue(item.imageUrl) || undefined,
    mlsNumber: stringValue(item.mlsNumber) || id,
  }
}

function mapEvent(item: RawItem, leads: Lead[]): LeadEvent | null {
  const timestamp = stringValue(item.timestamp) || stringValue(item.occurredAt)
  const sk = stringValue(item.sk)
  const id = stringValue(item.eventId) || sk.replace(/^EVENT#/, '') || `event-${timestamp}`
  const leadId = stringValue(item.personId) || resolveLeadIdFromPk(stringValue(item.pk), leads)
  if (!id || !leadId || !timestamp) return null

  return {
    id,
    leadId,
    type: normalizeEventType(item.eventType),
    description: stringValue(item.description) || describeEvent(item),
    occurredAt: timestamp,
    propertyId: stringValue(item.propertyId) || undefined,
    metadata: recordValue(item.metadata),
  }
}

function mapAction(item: RawItem): RecommendedAction | null {
  const id = stringValue(item.actionId) || stringValue(item.sk).split('#').at(-1)
  const title = stringValue(item.title)
  if (!id || !title) return null

  return {
    id,
    type: normalizeActionType(item.actionType),
    title,
    summary: stringValue(item.description) || title,
    leadId: stringValue(item.personId) || undefined,
    propertyId: stringValue(item.propertyId) || undefined,
    transactionId: stringValue(item.transactionId) || undefined,
    priorityScore: numberValue(item.priorityScore, 70),
    urgency: normalizeUrgency(item.urgency),
    confidence: numberValue(item.confidence, 85),
    reasons: stringArray(item.reasons, [stringValue(item.description) || 'Imported from DynamoDB action table.']),
    consequenceIfIgnored: stringValue(item.consequenceIfIgnored) || undefined,
    status: normalizeActionStatus(item.status),
    draftMessage: stringValue(item.draftMessage) || undefined,
    scheduledFor: stringValue(item.dueAt) || undefined,
  }
}

function mapTask(item: RawItem): Task | null {
  const action = mapAction(item)
  if (!action) return null

  return {
    id: `task:${action.id}`,
    type: action.type === 'email' ? 'email' : action.type === 'text' ? 'text' : action.type === 'call' ? 'call' : 'other',
    title: action.title,
    leadId: action.leadId,
    dueTime: formatDueTime(action.scheduledFor),
    scheduledFor: action.scheduledFor,
    completed: action.status === 'done',
  }
}

function sortActions(actions: RecommendedAction[]) {
  return [...actions].sort((a, b) => b.priorityScore - a.priorityScore)
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stringArray(value: unknown, fallback: string[] = []) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : fallback
}

function recordValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, string | number | boolean>)
    : undefined
}

function normalizeLeadStage(value: unknown): LeadStage {
  const stage = stringValue(value).toLowerCase()
  if (stage === 'new' || stage === 'nurturing' || stage === 'hot' || stage === 'active' || stage === 'cold') {
    return stage
  }
  return stage.includes('hot') ? 'hot' : 'active'
}

function normalizePropertyStatus(value: unknown): PropertyStatus {
  const status = stringValue(value).toLowerCase()
  if (status === 'active' || status === 'back_on_market' || status === 'pending' || status === 'sold') return status
  return 'active'
}

function normalizeEventType(value: unknown): EventType {
  const eventType = stringValue(value).toLowerCase()
  if (eventType === 'viewed_property') return 'listing_view'
  if (eventType === 'saved_property') return 'listing_save'
  if (eventType === 'showing_requested') return 'showing_request'
  if (eventType === 'returned_to_site') return 'back_to_site'
  if (eventType === 'email_open') return 'email_opened'

  const valid: EventType[] = [
    'listing_view',
    'listing_save',
    'mortgage_calc_used',
    'showing_request',
    'back_to_site',
    'valuation_request',
    'email_opened',
    'email_replied',
    'call_completed',
    'document_signed',
    'search_refined',
    'price_drop_alert_opened',
    'virtual_tour_requested',
    'pre_approval_uploaded',
  ]
  return valid.includes(eventType as EventType) ? eventType as EventType : 'listing_view'
}

function normalizeActionType(value: unknown): RecommendedAction['type'] {
  const actionType = stringValue(value).toLowerCase()
  if (actionType.includes('listing')) return 'send_listing'
  if (actionType.includes('transaction') || actionType.includes('review')) return 'review_transaction'
  if (actionType.includes('schedule') || actionType.includes('follow')) return 'schedule_followup'
  if (actionType.includes('email')) return 'email'
  if (actionType.includes('text') || actionType.includes('message')) return 'text'
  return 'call'
}

function normalizeUrgency(value: unknown): RecommendedAction['urgency'] {
  const urgency = stringValue(value).toLowerCase()
  if (urgency === 'low' || urgency === 'medium' || urgency === 'high' || urgency === 'critical') return urgency
  return 'medium'
}

function normalizeActionStatus(value: unknown): RecommendedAction['status'] {
  const status = stringValue(value).toLowerCase()
  if (status === 'pending' || status === 'in_progress' || status === 'done' || status === 'snoozed') return status
  return 'pending'
}

function preferredAreasFrom(raw: RawItem, tags: string[]) {
  const explicit = stringArray(raw.preferredAreas)
  if (explicit.length) return explicit

  const areaTags = tags
    .map((tag) => tag.replace(/_/g, ' '))
    .filter((tag) => !tag.includes('buyer') && !tag.includes('seller'))
    .map((tag) => titleCase(tag))

  return areaTags.length ? areaTags : ['Scottsdale', 'Phoenix', 'Tempe']
}

function intentSignalsFrom(raw: RawItem, tags: string[], stage: LeadStage) {
  const explicit = stringArray(raw.intentSignals)
  if (explicit.length) return explicit

  const signals = new Set<string>()
  for (const tag of tags) {
    if (tag.includes('hot')) signals.add('high_intent')
    if (tag.includes('buyer')) signals.add('saved_listing')
    if (tag.includes('seller')) signals.add('valuation_request')
  }
  if (stage === 'hot') signals.add('high_intent')
  if (stringValue(raw.lastVisitAt)) signals.add('back_to_site')
  return Array.from(signals.size ? signals : new Set(['new_lead']))
}

function buildRecentBehavior(raw: RawItem, tags: string[]) {
  const behavior = stringArray(raw.recentBehavior)
  if (behavior.length) return behavior

  const lines = []
  const lastVisitAt = stringValue(raw.lastVisitAt)
  if (lastVisitAt) lines.push(`Last visited site on ${formatDateLabel(lastVisitAt)}`)
  if (tags.length) lines.push(`Tagged as ${tags.map((tag) => tag.replace(/_/g, ' ')).join(', ')}`)
  lines.push(`${stringValue(raw.pipeline) || 'Lead'} stage: ${stringValue(raw.stage) || 'Active'}`)
  return lines
}

function daysAgo(dateValue: string) {
  if (!dateValue) return 0
  const time = new Date(dateValue).getTime()
  if (!Number.isFinite(time)) return 0
  return Math.max(0, Math.round((DEMO_NOW - time) / (24 * 60 * 60 * 1000)))
}

function engagementFromScore(score: number): EngagementLevel {
  if (score >= 75) return 'high'
  if (score >= 55) return 'medium'
  if (score >= 30) return 'low'
  return 'none'
}

function parseAddress(address: string) {
  const parts = address.split(',').map((part) => part.trim())
  const stateZip = parts[2]?.split(/\s+/) ?? []
  return {
    street: parts[0] || address,
    city: parts[1] || 'Scottsdale',
    state: stateZip[0] || 'AZ',
    zip: stateZip[1] || '',
  }
}

function resolveLeadIdFromPk(pk: string, leads: Lead[]) {
  const token = pk.replace(/^USER#/, '').replace(/_/g, ' ').toLowerCase()
  const match = leads.find((lead) => lead.name.toLowerCase().includes(token.split(' ')[0] ?? token))
  return match?.id || pk.replace(/^USER#/, '')
}

function describeEvent(item: RawItem) {
  const eventType = stringValue(item.eventType, 'event').replace(/_/g, ' ')
  const propertyId = stringValue(item.propertyId)
  return propertyId ? `${titleCase(eventType)} for ${propertyId}` : titleCase(eventType)
}

function formatDueTime(value?: string) {
  if (!value) return 'Anytime'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Anytime'
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatDateLabel(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase())
}
