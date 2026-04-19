import { getAppData } from '@/lib/data/app-data'
import type { AppData } from '@/types/app-data'
import type {
  AssistantCommunication,
  AssistantDecision,
  AssistantIntent,
  AssistantRequest,
} from '@/types/assistant'

const VALID_INTENTS: AssistantIntent[] = [
  'navigate_dashboard',
  'navigate_leads',
  'navigate_listings',
  'navigate_transactions',
  'navigate_calendar',
  'navigate_actions',
  'open_lead_detail',
  'open_property_detail',
  'open_transaction_detail',
  'highlight_top_lead',
  'highlight_urgent_task',
  'explain_action',
  'send_email',
  'send_text_message',
  'general_question',
  'clarification_request',
]

const VALID_ROUTES = ['/dashboard', '/dashboard/briefing', '/people', '/transactions', '/calendar']

const assistantResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'intent',
    'targetRoute',
    'targetId',
    'highlight',
    'voiceResponse',
    'confidence',
    'clarificationQuestion',
    'communication',
  ],
  properties: {
    intent: { type: 'string', enum: VALID_INTENTS },
    targetRoute: {
      anyOf: [
        { type: 'string', enum: VALID_ROUTES },
        { type: 'null' },
      ],
    },
    targetId: { type: ['string', 'null'] },
    highlight: { type: 'boolean' },
    voiceResponse: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    clarificationQuestion: { type: ['string', 'null'] },
    communication: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: [
            'channel',
            'leadId',
            'recipientName',
            'recipientEmail',
            'recipientPhone',
            'subject',
            'body',
            'deliveryStatus',
            'messageId',
            'launchHref',
            'error',
          ],
          properties: {
            channel: { type: 'string', enum: ['email', 'sms'] },
            leadId: { type: 'string' },
            recipientName: { type: 'string' },
            recipientEmail: { type: ['string', 'null'] },
            recipientPhone: { type: ['string', 'null'] },
            subject: { type: ['string', 'null'] },
            body: { type: 'string' },
            deliveryStatus: { type: 'string', enum: ['pending', 'prepared', 'sent', 'failed'] },
            messageId: { type: ['string', 'null'] },
            launchHref: { type: ['string', 'null'] },
            error: { type: ['string', 'null'] },
          },
        },
      ],
    },
  },
} as const

export async function getAssistantDecision(request: AssistantRequest): Promise<AssistantDecision> {
  const appData = await getAppData()
  const assistantContext = getAssistantContext(appData)
  const normalizedMessage = request.message.trim()
  if (!normalizedMessage) return fallbackDecision(request, assistantContext)

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return fallbackDecision(request, assistantContext)

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
            content: buildSystemPrompt(),
          },
          {
            role: 'user',
            content: JSON.stringify({
              request: normalizedMessage,
              currentPath: request.currentPath,
              recentExecutedActionIds: request.recentExecutedActionIds ?? [],
              context: assistantContext,
            }),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'lofty_assistant_decision',
            strict: true,
            schema: assistantResponseSchema,
          },
        },
      }),
    })

    if (!response.ok) {
      console.error('[Assistant] OpenAI error:', await response.text().catch(() => response.statusText))
      return fallbackDecision(request, assistantContext)
    }

    const data = await response.json()
    const output = extractResponseText(data)
    if (!output) return fallbackDecision(request, assistantContext)

    return withRequestDefaults(normalizeDecision(JSON.parse(output)), request.message)
  } catch (error) {
    console.error('[Assistant] decision error:', error)
    return fallbackDecision(request, assistantContext)
  }
}

export function getAssistantContext(data: AppData) {
  const actions = data.actions
  const topAction = actions[0] ?? null
  const topLeadAction = actions.find((action) => action.leadId) ?? null
  const topLead = topLeadAction?.leadId
    ? data.leads.find((lead) => lead.id === topLeadAction.leadId) ?? highestScoreLead(data)
    : highestScoreLead(data)
  const topListingAction = actions.find((action) => action.type === 'send_listing' && action.propertyId) ?? null
  const hottestProperty = topListingAction?.propertyId
    ? data.properties.find((property) => property.id === topListingAction.propertyId) ?? null
    : null
  const urgentTransaction =
    [...data.transactions].sort((a, b) => a.daysUntilDeadline - b.daysUntilDeadline)[0] ?? null
  const urgentTask = data.tasks.find((task) => !task.completed) ?? null

  return {
    routes: VALID_ROUTES,
    calendar: {
      route: '/calendar',
      highlightId: 'section:calendar',
      conflictsHighlightId: 'section:calendar-conflicts',
      capability: 'Shows AI-added tasks, day/week/month views, conflicts, and free-time suggestions.',
    },
    topAction: topAction
      ? {
          id: topAction.id,
          type: topAction.type,
          title: topAction.title,
          route: '/dashboard',
          highlightId: 'section:tasks',
          summary: topAction.summary,
        }
      : null,
    topLead: topLead
      ? {
          id: topLead.id,
          name: topLead.name,
          score: topLead.score,
          route: '/people',
          highlightId: `lead:${topLead.id}`,
          recentBehavior: topLead.recentBehavior,
        }
      : null,
    hottestListingMatch: hottestProperty
      ? {
          id: hottestProperty.id,
          address: hottestProperty.address,
          city: hottestProperty.city,
          route: '/people',
          highlightId: `property:${hottestProperty.id}`,
          actionTitle: topListingAction?.title,
        }
      : null,
    urgentTransaction: urgentTransaction
      ? {
          id: urgentTransaction.id,
          address: urgentTransaction.address,
          route: '/transactions',
          highlightId: `transaction:${urgentTransaction.id}`,
          deadline: urgentTransaction.nextDeadlineLabel,
          daysUntilDeadline: urgentTransaction.daysUntilDeadline,
        }
      : null,
    urgentTask: urgentTask
      ? {
          id: urgentTask.id,
          title: urgentTask.title,
          route: '/dashboard',
          highlightId: `task:${urgentTask.id}`,
        }
      : null,
    leads: data.leads.map((lead) => ({
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      score: lead.score,
      route: '/people',
      highlightId: `lead:${lead.id}`,
    })),
    properties: data.properties.map((property) => ({
      id: property.id,
      address: property.address,
      city: property.city,
      route: '/people',
      highlightId: `property:${property.id}`,
    })),
    transactions: data.transactions.map((transaction) => ({
      id: transaction.id,
      address: transaction.address,
      route: '/transactions',
      highlightId: `transaction:${transaction.id}`,
    })),
  }
}

function buildSystemPrompt() {
  return [
    'You are the intent router for the Lofty AI Copilot demo.',
    'Return valid JSON only. No markdown, no prose outside the JSON.',
    'Use only the provided routes, ids, and records. Do not fabricate records.',
    'If the request is ambiguous, use intent clarification_request, no targetRoute, no targetId, highlight false, and include a short clarificationQuestion.',
    'For requests to email or mail a lead, use intent send_email and include communication with channel email, the matching lead id, recipient details, a concise subject, and the exact body to send.',
    'For requests to text, SMS, or message a lead, use intent send_text_message and include communication with channel sms, the matching lead id, recipient details, no subject, and the exact text body. SMS is prepared in the device composer for the agent to review and send.',
    'If a communication request does not clearly name a provided lead, ask a clarification question.',
    'If a communication request does not provide message wording, create a short professional real estate follow-up using the lead context.',
    'Prefer the most useful page for the user request: top leads go to /people, calendar/schedule/free-time/conflict questions go to /calendar, urgent transactions go to /transactions, top actions and tasks go to /dashboard, the full action plan goes to /dashboard/briefing.',
    'voiceResponse should be warm, concise, and confident, suitable for spoken playback.',
  ].join(' ')
}

function fallbackDecision(
  request: AssistantRequest,
  context: ReturnType<typeof getAssistantContext>,
): AssistantDecision {
  const text = request.message.toLowerCase()
  const communicationDecision = fallbackCommunicationDecision(request.message, context)
  if (communicationDecision) return communicationDecision

  if (matches(text, ['lead', 'leads', 'people', 'crm'])) {
    if (matches(text, ['top', 'best', 'highest', 'priority'])) {
      return {
        intent: 'highlight_top_lead',
        targetRoute: '/people',
        targetId: context.topLead?.highlightId ?? null,
        highlight: !!context.topLead,
        voiceResponse: context.topLead
          ? `Here is your top lead. I highlighted ${context.topLead.name} for you.`
          : 'I opened your leads page.',
        confidence: 0.9,
        clarificationQuestion: null,
        communication: null,
      }
    }
    return {
      intent: 'navigate_leads',
      targetRoute: '/people',
      targetId: null,
      highlight: false,
      voiceResponse: 'Here is your leads page.',
      confidence: 0.86,
      clarificationQuestion: null,
      communication: null,
    }
  }

  if (matches(text, ['transaction', 'deal', 'closing', 'deadline', 'attention'])) {
    return {
      intent: 'open_transaction_detail',
      targetRoute: '/transactions',
      targetId: context.urgentTransaction?.highlightId ?? null,
      highlight: !!context.urgentTransaction,
      voiceResponse: context.urgentTransaction
        ? 'This is the transaction that needs attention today.'
        : 'I opened your transactions page.',
      confidence: 0.9,
      clarificationQuestion: null,
      communication: null,
    }
  }

  if (matches(text, ['calendar', 'schedule', 'availability', 'free time', 'conflict', 'conflicts', 'week', 'month'])) {
    return {
      intent: 'navigate_calendar',
      targetRoute: '/calendar',
      targetId: matches(text, ['conflict', 'conflicts', 'free time', 'availability'])
        ? 'section:calendar-conflicts'
        : 'section:calendar',
      highlight: true,
      voiceResponse: matches(text, ['conflict', 'conflicts'])
        ? 'I opened the calendar and highlighted the AI conflict checks.'
        : 'I opened your CRM calendar with AI-added tasks.',
      confidence: 0.88,
      clarificationQuestion: null,
      communication: null,
    }
  }

  if (matches(text, ['listing', 'property', 'match'])) {
    return {
      intent: 'open_property_detail',
      targetRoute: '/people',
      targetId: context.hottestListingMatch?.highlightId ?? null,
      highlight: !!context.hottestListingMatch,
      voiceResponse: context.hottestListingMatch
        ? `Here is your hottest listing match: ${context.hottestListingMatch.address}.`
        : 'I opened the leads page where listing matches are surfaced.',
      confidence: 0.84,
      clarificationQuestion: null,
      communication: null,
    }
  }

  if (matches(text, ['task', 'tasks', 'urgent'])) {
    return {
      intent: 'highlight_urgent_task',
      targetRoute: '/dashboard',
      targetId: context.urgentTask?.highlightId ?? 'section:tasks',
      highlight: true,
      voiceResponse: 'I opened your urgent tasks and highlighted the next one to handle.',
      confidence: 0.82,
      clarificationQuestion: null,
      communication: null,
    }
  }

  if (matches(text, ['first', 'next', 'do first', 'what should i do', 'plan', 'action'])) {
    return {
      intent: 'navigate_actions',
      targetRoute: '/dashboard',
      targetId: 'section:tasks',
      highlight: true,
      voiceResponse: context.topAction
        ? `Start with ${context.topAction.title}. I highlighted it for you.`
        : 'I opened your action plan.',
      confidence: 0.88,
      clarificationQuestion: null,
      communication: null,
    }
  }

  if (matches(text, ['dashboard', 'overview', 'home'])) {
    return {
      intent: 'navigate_dashboard',
      targetRoute: '/dashboard',
      targetId: 'section:briefing',
      highlight: true,
      voiceResponse: 'Here is your AI overview.',
      confidence: 0.82,
      clarificationQuestion: null,
      communication: null,
    }
  }

  return {
    intent: 'clarification_request',
    targetRoute: null,
    targetId: null,
    highlight: false,
    voiceResponse: 'I can help with leads, actions, listings, tasks, or transactions. Which one should I open?',
    confidence: 0.45,
    clarificationQuestion: 'Do you want leads, actions, listings, tasks, or transactions?',
    communication: null,
  }
}

function fallbackCommunicationDecision(
  message: string,
  context: ReturnType<typeof getAssistantContext>,
): AssistantDecision | null {
  const text = message.toLowerCase()
  const wantsEmail = matches(text, ['email', 'mail'])
  const wantsText = matches(text, ['text', 'sms', 'message'])
  if (!wantsEmail && !wantsText) return null

  const lead = findMentionedLead(message, context.leads)
  if (!lead) {
    return {
      intent: 'clarification_request',
      targetRoute: null,
      targetId: null,
      highlight: false,
      voiceResponse: 'Who should I send that to?',
      confidence: 0.55,
      clarificationQuestion: 'Which lead should I contact?',
      communication: null,
    }
  }

  const body = extractRequestedMessage(message) ?? defaultContactMessage(lead.name)

  if (wantsEmail) {
    return {
      intent: 'send_email',
      targetRoute: '/people',
      targetId: lead.highlightId,
      highlight: true,
      voiceResponse: `I can send that email to ${lead.name}.`,
      confidence: 0.78,
      clarificationQuestion: null,
      communication: {
        channel: 'email',
        leadId: lead.id,
        recipientName: lead.name,
        recipientEmail: lead.email,
        recipientPhone: lead.phone,
        subject: `Following up, ${lead.name}`,
        body,
        deliveryStatus: 'pending',
        messageId: null,
        launchHref: null,
        error: null,
      },
    }
  }

  return {
    intent: 'send_text_message',
    targetRoute: '/people',
    targetId: lead.highlightId,
    highlight: true,
    voiceResponse: `I can send that text to ${lead.name}.`,
    confidence: 0.78,
    clarificationQuestion: null,
    communication: {
      channel: 'sms',
      leadId: lead.id,
      recipientName: lead.name,
      recipientEmail: lead.email,
      recipientPhone: lead.phone,
      subject: null,
      body,
      deliveryStatus: 'pending',
      messageId: null,
      launchHref: null,
      error: null,
    },
  }
}

function findMentionedLead(
  message: string,
  leads: ReturnType<typeof getAssistantContext>['leads'],
) {
  const normalized = normalizeForSearch(message)
  return leads.find((lead) => {
    const name = normalizeForSearch(lead.name)
    const parts = name.split(' ').filter(Boolean)
    return normalized.includes(name) || parts.some((part) => part.length > 2 && normalized.includes(part))
  })
}

function extractRequestedMessage(message: string) {
  const patterns = [
    /\b(?:that|saying|says|say|with message)\s+["“]?(.+?)["”]?$/i,
    /:\s*["“]?(.+?)["”]?$/i,
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)?.[1]?.trim()
    if (match) return cleanQuotedText(match)
  }

  return null
}

function defaultContactMessage(name: string) {
  return `Hi ${firstName(name)}, I wanted to follow up on your home search. Are you available for a quick conversation today?`
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || 'there'
}

function normalizeForSearch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function cleanQuotedText(value: string) {
  return value.replace(/^['"“”]+|['"“”]+$/g, '').trim()
}

function normalizeDecision(value: unknown): AssistantDecision {
  const candidate = value as Partial<AssistantDecision>
  const targetRoute = candidate.targetRoute && VALID_ROUTES.includes(candidate.targetRoute)
    ? candidate.targetRoute
    : null
  const intent = candidate.intent && VALID_INTENTS.includes(candidate.intent)
    ? candidate.intent
    : 'general_question'

  return withRequestDefaults({
    intent,
    targetRoute,
    targetId: typeof candidate.targetId === 'string' ? candidate.targetId : null,
    highlight: Boolean(candidate.highlight),
    voiceResponse:
      typeof candidate.voiceResponse === 'string' && candidate.voiceResponse.trim()
        ? candidate.voiceResponse.trim()
        : 'I found the best place for that.',
    confidence:
      typeof candidate.confidence === 'number'
        ? Math.max(0, Math.min(1, candidate.confidence))
        : 0.6,
    clarificationQuestion:
      typeof candidate.clarificationQuestion === 'string'
        ? candidate.clarificationQuestion
        : null,
    communication: normalizeCommunication(candidate.communication),
  }, '')
}

function normalizeCommunication(value: unknown): AssistantCommunication | null {
  const candidate = value as Partial<AssistantCommunication> | null
  if (!candidate || typeof candidate !== 'object') return null
  if (candidate.channel !== 'email' && candidate.channel !== 'sms') return null
  if (typeof candidate.leadId !== 'string' || !candidate.leadId.trim()) return null
  if (typeof candidate.recipientName !== 'string' || !candidate.recipientName.trim()) return null
  if (typeof candidate.body !== 'string' || !candidate.body.trim()) return null

  return {
    channel: candidate.channel,
    leadId: candidate.leadId.trim(),
    recipientName: candidate.recipientName.trim(),
    recipientEmail: typeof candidate.recipientEmail === 'string' ? candidate.recipientEmail.trim() : null,
    recipientPhone: typeof candidate.recipientPhone === 'string' ? candidate.recipientPhone.trim() : null,
    subject: typeof candidate.subject === 'string' ? candidate.subject.trim() : null,
    body: candidate.body.trim(),
    deliveryStatus: candidate.deliveryStatus ?? 'pending',
    messageId: typeof candidate.messageId === 'string' ? candidate.messageId : null,
    launchHref: typeof candidate.launchHref === 'string' ? candidate.launchHref : null,
    error: typeof candidate.error === 'string' ? candidate.error : null,
  }
}

function withRequestDefaults(decision: AssistantDecision, message: string): AssistantDecision {
  const text = message.toLowerCase()

  if (decision.intent === 'navigate_calendar') {
    const requestedConflictView = matches(text, ['conflict', 'conflicts', 'free time', 'availability'])
    return {
      ...decision,
      targetRoute: '/calendar',
      targetId: requestedConflictView
        ? 'section:calendar-conflicts'
        : decision.targetId ?? 'section:calendar',
      highlight: true,
    }
  }

  return decision
}

function highestScoreLead(data: AppData) {
  return [...data.leads].sort((a, b) => b.score - a.score)[0] ?? null
}

function matches(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term))
}

function extractResponseText(data: { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> }) {
  if (typeof data.output_text === 'string') return data.output_text
  return data.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .find((text): text is string => typeof text === 'string')
}
