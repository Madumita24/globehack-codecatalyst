import 'server-only'

import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { ddb } from '@/lib/data/dynamodb'
import { getAppData } from '@/lib/data/app-data'
import { fetchRecentGmailMessages, isGmailConfigured, type GmailMessage } from '@/lib/gmail/client'
import type { RecommendedAction } from '@/types/action'
import type { Lead } from '@/types/lead'

type ReplyInsight = {
  replyType:
    | 'reschedule_request'
    | 'appointment_request'
    | 'preference_update'
    | 'positive_reply'
    | 'question'
    | 'not_interested'
    | 'general_reply'
  summary: string
  requestedTime: string | null
  preferenceSummary: string | null
  preferredAreas: string[]
  minBeds: number | null
  maxBeds: number | null
  minBaths: number | null
  propertyTypes: string[]
  nextActionTitle: string
  nextActionDescription: string
  suggestedReply: string
  urgency: RecommendedAction['urgency']
  actionType: RecommendedAction['type']
  leadStage: Lead['stage'] | null
  scoreDelta: number
}

type GmailSyncResult = {
  ok: boolean
  skipped: boolean
  reason: string | null
  scanned: number
  matched: number
  processed: number
  duplicates: number
  createdActions: number
  updatedLeads: number
  errors: Array<{ messageId?: string; error: string }>
}

const replyInsightSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'replyType',
    'summary',
    'requestedTime',
    'preferenceSummary',
    'preferredAreas',
    'minBeds',
    'maxBeds',
    'minBaths',
    'propertyTypes',
    'nextActionTitle',
    'nextActionDescription',
    'suggestedReply',
    'urgency',
    'actionType',
    'leadStage',
    'scoreDelta',
  ],
  properties: {
    replyType: {
      type: 'string',
      enum: [
        'reschedule_request',
        'appointment_request',
        'preference_update',
        'positive_reply',
        'question',
        'not_interested',
        'general_reply',
      ],
    },
    summary: { type: 'string' },
    requestedTime: { type: ['string', 'null'] },
    preferenceSummary: { type: ['string', 'null'] },
    preferredAreas: { type: 'array', items: { type: 'string' } },
    minBeds: { type: ['number', 'null'] },
    maxBeds: { type: ['number', 'null'] },
    minBaths: { type: ['number', 'null'] },
    propertyTypes: { type: 'array', items: { type: 'string' } },
    nextActionTitle: { type: 'string' },
    nextActionDescription: { type: 'string' },
    suggestedReply: { type: 'string' },
    urgency: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
    actionType: {
      type: 'string',
      enum: ['call', 'text', 'email', 'send_listing', 'review_transaction', 'schedule_followup'],
    },
    leadStage: { type: ['string', 'null'], enum: ['new', 'nurturing', 'hot', 'active', 'cold', null] },
    scoreDelta: { type: 'number' },
  },
} as const

export async function syncGmailReplies(): Promise<GmailSyncResult> {
  const result: GmailSyncResult = {
    ok: true,
    skipped: false,
    reason: null,
    scanned: 0,
    matched: 0,
    processed: 0,
    duplicates: 0,
    createdActions: 0,
    updatedLeads: 0,
    errors: [],
  }

  if (!isGmailConfigured()) {
    return {
      ...result,
      skipped: true,
      reason: 'gmail_not_configured',
    }
  }

  const eventsTable = process.env.DDB_EVENTS_TABLE
  const actionsTable = process.env.DDB_ACTIONS_TABLE
  const peopleTable = process.env.DDB_PEOPLE_TABLE

  if (!eventsTable || !actionsTable || !peopleTable) {
    return {
      ...result,
      skipped: true,
      reason: 'dynamodb_tables_not_configured',
    }
  }

  const data = await getAppData()
  const leadsByEmail = new Map(data.leads.map((lead) => [lead.email.toLowerCase(), lead]))
  const messages = await fetchRecentGmailMessages({ maxResults: 10, newerThanDays: 7 })
  result.scanned = messages.length

  for (const message of messages) {
    const lead = leadsByEmail.get(message.fromEmail)
    if (!lead) continue
    result.matched += 1

    try {
      const insight = await parseReplyInsight(message, lead)
      const eventCreated = await putReplyEvent(eventsTable, message, lead, insight)

      if (!eventCreated) {
        result.duplicates += 1
        continue
      }

      result.processed += 1
      const leadUpdated = await updateLeadFromInsight(peopleTable, lead, insight, message)
      if (leadUpdated) result.updatedLeads += 1
      const actionCreated = await putFollowUpAction(actionsTable, message, lead, insight)
      if (actionCreated) result.createdActions += 1
    } catch (error) {
      result.errors.push({
        messageId: message.id,
        error: error instanceof Error ? error.message : 'Gmail reply processing failed.',
      })
    }
  }

  return result
}

async function parseReplyInsight(message: GmailMessage, lead: Lead): Promise<ReplyInsight> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return fallbackInsight(message, lead)

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        input: [
          {
            role: 'system',
            content: [
              'You extract real estate CRM updates from lead email replies.',
              'Return valid JSON only.',
              'Do not invent facts. Use null or empty arrays when the reply does not contain a detail.',
              'Create a next action for the agent that is specific and demo-friendly.',
              'If the lead wants to reschedule or book time, actionType should be schedule_followup.',
              'If the lead asks a question or needs a response, actionType should be email.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify({
              lead: {
                name: lead.name,
                email: lead.email,
                currentPreferences: lead.preferences,
                preferredAreas: lead.preferredAreas,
                currentStage: lead.stage,
                score: lead.score,
              },
              email: {
                from: message.from,
                subject: message.subject,
                date: message.date,
                body: message.body.slice(0, 5000),
              },
            }),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'lofty_gmail_reply_insight',
            strict: true,
            schema: replyInsightSchema,
          },
        },
      }),
    })

    if (!response.ok) {
      console.error('[GmailSync] OpenAI error:', await response.text().catch(() => response.statusText))
      return fallbackInsight(message, lead)
    }

    const payload = await response.json()
    const output = extractResponseText(payload)
    if (!output) return fallbackInsight(message, lead)
    return normalizeInsight(JSON.parse(output), message, lead)
  } catch (error) {
    console.error('[GmailSync] Reply parse failed:', error)
    return fallbackInsight(message, lead)
  }
}

async function putReplyEvent(
  tableName: string,
  message: GmailMessage,
  lead: Lead,
  insight: ReplyInsight,
) {
  try {
    await ddb.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          pk: `PERSON#${lead.id}`,
          sk: `EVENT#GMAIL#${message.id}`,
          eventId: `gmail_reply_${message.id}`,
          personId: lead.id,
          eventType: 'email_replied',
          description: insight.summary,
          timestamp: messageTimestamp(message),
          occurredAt: messageTimestamp(message),
          gmailMessageId: message.id,
          gmailThreadId: message.threadId,
          subject: message.subject,
          fromEmail: message.fromEmail,
          replyType: insight.replyType,
          requestedTime: insight.requestedTime ?? undefined,
          preferenceSummary: insight.preferenceSummary ?? undefined,
          nextActionTitle: insight.nextActionTitle,
        },
        ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
      }),
    )
    return true
  } catch (error) {
    if (isConditionalCheckFailed(error)) return false
    throw error
  }
}

async function updateLeadFromInsight(
  tableName: string,
  lead: Lead,
  insight: ReplyInsight,
  message: GmailMessage,
) {
  const names: Record<string, string> = {
    '#lastTouchAt': 'lastTouchAt',
    '#updatedAt': 'updatedAt',
  }
  const values: Record<string, unknown> = {
    ':lastTouchAt': messageTimestamp(message),
    ':updatedAt': new Date().toISOString(),
  }
  const sets = ['#lastTouchAt = :lastTouchAt', '#updatedAt = :updatedAt']

  if (insight.leadStage) {
    names['#stage'] = 'stage'
    values[':stage'] = insight.leadStage
    sets.push('#stage = :stage')
  }

  if (insight.scoreDelta !== 0) {
    names['#leadScore'] = 'leadScore'
    values[':leadScore'] = clampScore(lead.score + insight.scoreDelta)
    sets.push('#leadScore = :leadScore')
  }

  if (insight.preferredAreas.length > 0) {
    names['#preferredAreas'] = 'preferredAreas'
    values[':preferredAreas'] = mergeStrings(lead.preferredAreas, insight.preferredAreas)
    sets.push('#preferredAreas = :preferredAreas')
  }

  if (insight.minBeds) {
    names['#minBeds'] = 'minBeds'
    values[':minBeds'] = insight.minBeds
    sets.push('#minBeds = :minBeds')
  }

  if (insight.maxBeds) {
    names['#maxBeds'] = 'maxBeds'
    values[':maxBeds'] = insight.maxBeds
    sets.push('#maxBeds = :maxBeds')
  }

  if (insight.minBaths) {
    names['#minBaths'] = 'minBaths'
    values[':minBaths'] = insight.minBaths
    sets.push('#minBaths = :minBaths')
  }

  if (insight.propertyTypes.length > 0) {
    names['#propertyTypes'] = 'propertyTypes'
    values[':propertyTypes'] = mergeStrings(lead.preferences.propertyTypes, insight.propertyTypes)
    sets.push('#propertyTypes = :propertyTypes')
  }

  await ddb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: {
        personId: lead.id,
      },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  )

  return true
}

async function putFollowUpAction(
  tableName: string,
  message: GmailMessage,
  lead: Lead,
  insight: ReplyInsight,
) {
  const actionId = `gmail_followup_${message.id}`

  try {
    await ddb.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          pk: `PERSON#${lead.id}`,
          sk: `ACTION#${actionId}`,
          actionId,
          actionType: insight.actionType,
          title: insight.nextActionTitle,
          description: insight.nextActionDescription,
          personId: lead.id,
          priorityScore: priorityFromInsight(insight),
          urgency: insight.urgency,
          confidence: 92,
          reasons: [
            `${lead.name} replied by email.`,
            insight.preferenceSummary ?? insight.summary,
            insight.requestedTime ? `Requested time: ${insight.requestedTime}` : '',
          ].filter(Boolean),
          status: 'pending',
          draftMessage: insight.suggestedReply,
          dueAt: normalizeRequestedTime(insight.requestedTime) ?? new Date().toISOString(),
          gmailMessageId: message.id,
        },
        ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
      }),
    )
    return true
  } catch (error) {
    if (isConditionalCheckFailed(error)) return false
    throw error
  }
}

function fallbackInsight(message: GmailMessage, lead: Lead): ReplyInsight {
  const text = message.body.toLowerCase()
  const requestedTime = extractRequestedTime(message.body)
  const wantsSchedule = matches(text, ['reschedule', 'schedule', 'appointment', 'available', 'tomorrow', 'tuesday', 'wednesday', 'thursday', 'friday'])
  const notInterested = matches(text, ['not interested', 'stop', 'unsubscribe'])
  const preferenceSummary = extractPreferenceSummary(message.body)

  return {
    replyType: notInterested
      ? 'not_interested'
      : wantsSchedule
        ? requestedTime
          ? 'reschedule_request'
          : 'appointment_request'
        : preferenceSummary
          ? 'preference_update'
          : 'general_reply',
    summary: `${lead.name} replied: ${message.body.slice(0, 180)}`,
    requestedTime,
    preferenceSummary,
    preferredAreas: extractAreas(message.body),
    minBeds: extractNumberBefore(message.body, ['bed', 'beds', 'bedroom', 'bedrooms']),
    maxBeds: null,
    minBaths: extractNumberBefore(message.body, ['bath', 'baths', 'bathroom', 'bathrooms']),
    propertyTypes: [],
    nextActionTitle: wantsSchedule
      ? `Confirm timing with ${lead.name}`
      : notInterested
        ? `Mark ${lead.name} as opted out`
        : `Reply to ${lead.name}`,
    nextActionDescription: wantsSchedule
      ? `${lead.name} replied with scheduling intent${requestedTime ? ` for ${requestedTime}` : ''}.`
      : preferenceSummary
        ? `Update preferences and reply to ${lead.name}.`
        : `Review the reply and send a helpful follow-up.`,
    suggestedReply: `Hi ${firstName(lead.name)}, thanks for the update. I’ll take care of that and follow up with the next best step.`,
    urgency: wantsSchedule ? 'high' : 'medium',
    actionType: wantsSchedule ? 'schedule_followup' : 'email',
    leadStage: notInterested ? 'cold' : wantsSchedule ? 'hot' : null,
    scoreDelta: notInterested ? -20 : wantsSchedule ? 8 : 3,
  }
}

function normalizeInsight(value: unknown, message: GmailMessage, lead: Lead): ReplyInsight {
  const fallback = fallbackInsight(message, lead)
  const candidate = value as Partial<ReplyInsight>
  return {
    replyType: validReplyType(candidate.replyType) ? candidate.replyType : fallback.replyType,
    summary: cleanString(candidate.summary) || fallback.summary,
    requestedTime: cleanString(candidate.requestedTime),
    preferenceSummary: cleanString(candidate.preferenceSummary),
    preferredAreas: cleanArray(candidate.preferredAreas),
    minBeds: cleanNumber(candidate.minBeds),
    maxBeds: cleanNumber(candidate.maxBeds),
    minBaths: cleanNumber(candidate.minBaths),
    propertyTypes: cleanArray(candidate.propertyTypes),
    nextActionTitle: cleanString(candidate.nextActionTitle) || fallback.nextActionTitle,
    nextActionDescription: cleanString(candidate.nextActionDescription) || fallback.nextActionDescription,
    suggestedReply: cleanString(candidate.suggestedReply) || fallback.suggestedReply,
    urgency: validUrgency(candidate.urgency) ? candidate.urgency : fallback.urgency,
    actionType: validActionType(candidate.actionType) ? candidate.actionType : fallback.actionType,
    leadStage: validLeadStage(candidate.leadStage) ? candidate.leadStage : fallback.leadStage,
    scoreDelta: Math.max(-30, Math.min(30, cleanNumber(candidate.scoreDelta) ?? fallback.scoreDelta)),
  }
}

function messageTimestamp(message: GmailMessage) {
  const internal = Number(message.internalDate)
  if (Number.isFinite(internal) && internal > 0) return new Date(internal).toISOString()
  const parsed = new Date(message.date).getTime()
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString()
}

function normalizeRequestedTime(value: string | null) {
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function priorityFromInsight(insight: ReplyInsight) {
  if (insight.urgency === 'critical') return 96
  if (insight.urgency === 'high') return 88
  if (insight.replyType === 'reschedule_request' || insight.replyType === 'appointment_request') return 84
  if (insight.replyType === 'preference_update') return 78
  return 70
}

function extractResponseText(data: { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> }) {
  if (typeof data.output_text === 'string') return data.output_text
  return data.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .find((text): text is string => typeof text === 'string')
}

function extractRequestedTime(value: string) {
  const match = value.match(/\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b(?:[^.?!\n]{0,40})/i)
  return match?.[0]?.trim() ?? null
}

function extractPreferenceSummary(value: string) {
  const matches = [
    value.match(/\b\d+\s*(?:bed|beds|bedroom|bedrooms)\b/i)?.[0],
    value.match(/\b\d+\s*(?:bath|baths|bathroom|bathrooms)\b/i)?.[0],
    value.match(/\b(?:prefer|looking for|want|need)\b[^.?!\n]{0,120}/i)?.[0],
  ].filter(Boolean)
  return matches.length ? matches.join(', ') : null
}

function extractAreas(value: string) {
  const knownAreas = ['Phoenix', 'Scottsdale', 'Tempe', 'Chandler', 'Mesa', 'Gilbert', 'Redwood City', 'Palo Alto', 'Menlo Park']
  const lower = value.toLowerCase()
  return knownAreas.filter((area) => lower.includes(area.toLowerCase()))
}

function extractNumberBefore(value: string, words: string[]) {
  const pattern = new RegExp(`\\b(\\d+)\\s*(?:${words.join('|')})\\b`, 'i')
  const match = value.match(pattern)?.[1]
  return match ? Number(match) : null
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || 'there'
}

function matches(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term))
}

function mergeStrings(existing: string[], incoming: string[]) {
  return Array.from(new Set([...existing, ...incoming].map((value) => value.trim()).filter(Boolean)))
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function cleanString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function cleanArray(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)))
    : []
}

function cleanNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function validReplyType(value: unknown): value is ReplyInsight['replyType'] {
  return typeof value === 'string' && [
    'reschedule_request',
    'appointment_request',
    'preference_update',
    'positive_reply',
    'question',
    'not_interested',
    'general_reply',
  ].includes(value)
}

function validUrgency(value: unknown): value is ReplyInsight['urgency'] {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical'
}

function validActionType(value: unknown): value is ReplyInsight['actionType'] {
  return value === 'call' || value === 'text' || value === 'email' || value === 'send_listing' || value === 'review_transaction' || value === 'schedule_followup'
}

function validLeadStage(value: unknown): value is Lead['stage'] | null {
  return value === null || value === 'new' || value === 'nurturing' || value === 'hot' || value === 'active' || value === 'cold'
}

function isConditionalCheckFailed(error: unknown) {
  return error instanceof Error && error.name === 'ConditionalCheckFailedException'
}
