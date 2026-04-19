/**
 * Lofty AI Copilot — Scoring & Recommendation Engine
 *
 * Answers one question: "What should the agent do next, and why?"
 *
 * Priority formula:
 *   priorityScore = intentScore * 0.35 + urgencyScore * 0.30
 *                 + propertyMatchScore * 0.20 + riskScore * 0.15
 *
 * All sub-scores are 0–100. priorityScore is also 0–100 (rounded).
 */

import type { Lead } from '@/types/lead'
import type { Property } from '@/types/property'
import type { RecommendedAction, Transaction } from '@/types/action'
import type { LeadEvent } from '@/types/event'

// ─── Intent scoring ───────────────────────────────────────────────────────────

const INTENT_WEIGHTS: Record<string, number> = {
  high_view_frequency: 30,
  saved_listing: 20,
  mortgage_calc: 25,
  back_to_site: 20,
  showing_request: 35,
  valuation_request: 25,
  pre_approved: 28,
  new_lead: 8,
  high_browse_count: 15,
  increased_search_frequency: 18,
  high_intent: 30,
  luxury_segment: 10,
  price_drop_alert: 15,
  email_replied: 20,
  referral: 12,
  cooling_down: -25,
}

/**
 * How actively is this lead signaling purchase intent?
 * Drawn entirely from lead signals + behavior + stage.
 */
export function getIntentScore(lead: Lead): number {
  let score = 0

  for (const signal of lead.intentSignals) {
    score += INTENT_WEIGHTS[signal] ?? 5
  }

  // Each distinct recent behavior adds a small signal boost (cap at 20)
  score += Math.min(lead.recentBehavior.length * 5, 20)

  // Stage-level base adjustments
  if (lead.stage === 'hot') score += 20
  else if (lead.stage === 'active') score += 10
  else if (lead.stage === 'cold') score -= 15

  return clamp(score, 0, 100)
}

// ─── Urgency scoring ──────────────────────────────────────────────────────────

/**
 * How time-sensitive is contacting this lead right now?
 * Considers days since last contact, recent event spikes, and stage.
 */
export function getUrgencyScore(lead: Lead, events: LeadEvent[]): number {
  let score = 0

  // Inactivity penalty: the longer since last contact, the more urgent follow-up is
  const d = lead.lastContactDaysAgo
  if (d === 0) score += 5
  else if (d <= 2) score += 15
  else if (d <= 4) score += 30
  else if (d <= 6) score += 50
  else if (d <= 10) score += 65
  else if (d <= 14) score += 78
  else score += 90

  // Boost if there's been a spike of events in the last 48 hours
  const cutoff = new Date('2026-04-18T00:00:00Z').getTime() - 48 * 60 * 60 * 1000
  const recentCount = events.filter(
    (e) => e.leadId === lead.id && new Date(e.occurredAt).getTime() >= cutoff
  ).length
  if (recentCount >= 3) score += 15
  else if (recentCount >= 1) score += 8

  // Stage modifier
  if (lead.stage === 'hot') score += 10
  else if (lead.stage === 'new') score += 5    // new leads need a fast first touch
  else if (lead.stage === 'cold') score -= 15

  return clamp(score, 0, 100)
}

// ─── Property match scoring ───────────────────────────────────────────────────

/**
 * How well does a specific property fit this lead's criteria?
 * Used to surface the best send-listing recommendation.
 */
export function getPropertyMatchScore(lead: Lead, property: Property): number {
  // Pending/sold listings are not sendable
  if (property.status === 'pending' || property.status === 'sold') return 0

  let score = 0

  // Budget fit (0–40 pts) — allow up to 10% over budget
  const ratio = property.price / lead.budget
  if (ratio <= 1.0) score += 40
  else if (ratio <= 1.05) score += 30
  else if (ratio <= 1.10) score += 20
  else if (ratio <= 1.20) score += 5
  // > 1.20 = 0 pts

  // Area fit (0–30 pts)
  if (lead.preferredAreas.includes(property.city)) score += 30

  // Beds fit (0–15 pts)
  if (
    property.beds >= lead.preferences.minBeds &&
    property.beds <= lead.preferences.maxBeds
  ) {
    score += 15
  } else if (property.beds >= lead.preferences.minBeds) {
    score += 8
  }

  // Baths fit (0–10 pts)
  if (property.baths >= lead.preferences.minBaths) score += 10

  // Back-on-market bonus (0–15 pts) — time-sensitive opportunity
  if (property.status === 'back_on_market') score += 15

  return clamp(score, 0, 100)
}

// ─── Risk scoring ─────────────────────────────────────────────────────────────

/**
 * What is the risk of losing this lead due to inaction?
 * High risk = agent should act now or lose the deal.
 */
export function getRiskScore(lead: Lead): number {
  let score = 0

  if (lead.intentSignals.includes('cooling_down')) score += 40
  if (lead.stage === 'cold') score += 35
  if (lead.lastContactDaysAgo > 14) score += 30
  else if (lead.lastContactDaysAgo > 7) score += 15

  if (lead.score < 30) score += 20
  else if (lead.score < 50) score += 10

  return clamp(score, 0, 100)
}

// ─── Priority composite ───────────────────────────────────────────────────────

function computePriorityScore(
  intent: number,
  urgency: number,
  match: number,
  risk: number
): number {
  return Math.round(intent * 0.35 + urgency * 0.30 + match * 0.20 + risk * 0.15)
}

// ─── Action generation ────────────────────────────────────────────────────────

/**
 * Core engine entry point.
 * Evaluates every lead and every transaction, produces a ranked list
 * of RecommendedActions the agent should take today.
 */
export function generateRecommendedActions(
  leads: Lead[],
  properties: Property[],
  events: LeadEvent[],
  transactions: Transaction[]
): RecommendedAction[] {
  const actions: RecommendedAction[] = []
  let seq = 1

  // ── Transaction deadline reviews ────────────────────────────────────────────
  for (const tx of transactions) {
    if (tx.stage === 'closed') continue

    const txUrgency = getTxUrgencyScore(tx)
    const urgency = toUrgencyLevel(tx.daysUntilDeadline <= 1 ? 95 : txUrgency)

    // Transactions use urgency as the dominant signal across all four axes
    const priorityScore = computePriorityScore(
      txUrgency * 0.7,   // there is clear intent — we want this deal to close
      txUrgency,          // deadline proximity drives urgency
      50,                 // property already matched (deal is in progress)
      txUrgency * 0.8    // high risk if deadline is missed
    )

    const dayLabel =
      tx.daysUntilDeadline === 0
        ? 'today'
        : tx.daysUntilDeadline === 1
        ? 'tomorrow'
        : `in ${tx.daysUntilDeadline} days`

    actions.push({
      id: `action_${seq++}`,
      type: 'review_transaction',
      title: `Review transaction — ${tx.address.split(',')[0]}`,
      summary: `${tx.nextDeadlineLabel} ${dayLabel} · ${tx.stage} stage`,
      transactionId: tx.id,
      priorityScore,
      urgency,
      confidence: 97,
      reasons: [
        `${tx.nextDeadlineLabel} is due ${dayLabel}`,
        `Transaction is currently in ${tx.stage} stage`,
        `Closing date: ${tx.closingDate}`,
        `Sale price: $${tx.salePrice.toLocaleString()}`,
      ],
      consequenceIfIgnored:
        tx.daysUntilDeadline <= 1
          ? 'Missing this deadline may cause the deal to collapse and lose the commission'
          : 'Unresolved items can delay closing or trigger contract penalties',
      status: 'pending',
    })
  }

  // ── Lead-based actions ───────────────────────────────────────────────────────
  for (const lead of leads) {
    const intent = getIntentScore(lead)
    const urgency = getUrgencyScore(lead, events)
    const risk = getRiskScore(lead)
    const urgencyLevel = toUrgencyLevel(urgency)

    // Find the best-matching available property for this lead
    let bestMatchScore = 0
    let bestProperty: Property | null = null
    for (const p of properties) {
      const s = getPropertyMatchScore(lead, p)
      if (s > bestMatchScore) {
        bestMatchScore = s
        bestProperty = p
      }
    }

    const priority = computePriorityScore(intent, urgency, bestMatchScore, risk)

    // ── Send-listing action ────────────────────────────────────────────────────
    // Triggered when there is a strong property match and the lead is actively searching.
    const canSendListing =
      bestMatchScore >= 60 &&
      bestProperty !== null &&
      lead.stage !== 'cold' &&
      lead.stage !== 'new'

    if (canSendListing && bestProperty) {
      const listingReasons = buildListingReasons(lead, bestProperty, bestMatchScore)
      actions.push({
        id: `action_${seq++}`,
        type: 'send_listing',
        title: `Send ${bestProperty.address} to ${lead.name}`,
        summary: `${bestMatchScore}% match · ${bestProperty.beds}bd/${bestProperty.baths}ba · $${fmt(bestProperty.price)} in ${bestProperty.city}`,
        leadId: lead.id,
        propertyId: bestProperty.id,
        // Slightly lower than the call action — sending a listing is supporting evidence,
        // calling is the higher-value action when urgency is high.
        priorityScore: Math.round(priority * 0.9),
        urgency:
          bestProperty.status === 'back_on_market' ? 'high' : urgencyLevel,
        confidence: clamp(40 + bestMatchScore * 0.5, 50, 95),
        reasons: listingReasons,
        consequenceIfIgnored:
          bestProperty.status === 'back_on_market'
            ? 'Back-on-market listings move quickly — another agent may reach this lead first'
            : 'Lead may find this listing independently and engage a competing agent',
        status: 'pending',
        draftMessage: buildListingDraft(lead, bestProperty),
      })
    }

    // ── Call / follow-up / re-engage action ────────────────────────────────────
    // Triggered for any lead worth pursuing (intent or urgency threshold, or at-risk).
    const isCooling = lead.intentSignals.includes('cooling_down') || lead.stage === 'cold'
    const shouldContact = intent >= 40 || urgency >= 45 || isCooling

    if (shouldContact) {
      const contactReasons = buildContactReasons(lead, bestMatchScore, bestProperty)
      const actionType = resolveContactType(lead)

      actions.push({
        id: `action_${seq++}`,
        type: actionType,
        title: buildContactTitle(lead, actionType),
        summary:
          lead.recentBehavior[0] ??
          `${lead.stage} lead · budget $${fmt(lead.budget)}`,
        leadId: lead.id,
        priorityScore: priority,
        urgency: urgencyLevel,
        confidence: clamp(50 + intent * 0.3 + urgency * 0.15, 50, 95),
        reasons: contactReasons,
        consequenceIfIgnored: buildConsequence(lead, isCooling),
        status: 'pending',
        draftMessage: buildContactDraft(lead, bestProperty),
      })
    }
  }

  return sortActionsByPriority(actions)
}

// ─── Sort + filter ────────────────────────────────────────────────────────────

/** Returns the top N actions sorted by priorityScore descending. */
export function sortActionsByPriority(
  actions: RecommendedAction[],
  limit = 5
): RecommendedAction[] {
  return [...actions]
    .filter((a) => a.status === 'pending')
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, limit)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function fmt(n: number): string {
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : `${(n / 1000).toFixed(0)}k`
}

function getTxUrgencyScore(tx: Transaction): number {
  const d = tx.daysUntilDeadline
  if (d <= 0) return 100
  if (d === 1) return 95
  if (d === 2) return 85
  if (d <= 4) return 70
  if (d <= 7) return 50
  return 30
}

function toUrgencyLevel(score: number): RecommendedAction['urgency'] {
  if (score >= 90) return 'critical'
  if (score >= 65) return 'high'
  if (score >= 35) return 'medium'
  return 'low'
}

function resolveContactType(lead: Lead): RecommendedAction['type'] {
  if (lead.intentSignals.includes('showing_request')) return 'call'
  if (lead.stage === 'new') return 'schedule_followup'
  if (lead.intentSignals.includes('cooling_down') || lead.stage === 'cold') return 'email'
  if (lead.stage === 'hot') return 'call'
  return 'call'
}

function buildContactTitle(lead: Lead, type: RecommendedAction['type']): string {
  if (type === 'call') return `Call ${lead.name}`
  if (type === 'email') return `Re-engage ${lead.name} via email`
  if (type === 'schedule_followup') return `Schedule first touch with ${lead.name}`
  return `Follow up with ${lead.name}`
}

function buildListingReasons(
  lead: Lead,
  property: Property,
  matchScore: number
): string[] {
  const reasons: string[] = []
  if (lead.recentBehavior.length > 0) reasons.push(lead.recentBehavior[0])
  reasons.push(
    `${matchScore}% property match — budget, area, and bed/bath criteria all met`
  )
  if (property.status === 'back_on_market') {
    reasons.push(`${property.address} just came back on the market after ${property.daysOnMarket} days`)
  } else {
    reasons.push(`Listed ${property.daysOnMarket} day${property.daysOnMarket !== 1 ? 's' : ''} ago — new to market`)
  }
  if (lead.lastContactDaysAgo > 3) {
    reasons.push(`No contact in ${lead.lastContactDaysAgo} days — agent window closing`)
  }
  return reasons
}

function buildContactReasons(
  lead: Lead,
  matchScore: number,
  bestProperty: Property | null
): string[] {
  const reasons: string[] = []
  if (lead.lastContactDaysAgo > 0) {
    reasons.push(`No contact in ${lead.lastContactDaysAgo} day${lead.lastContactDaysAgo !== 1 ? 's' : ''}`)
  }
  reasons.push(...lead.recentBehavior.slice(0, 2))
  if (matchScore >= 60 && bestProperty) {
    reasons.push(
      `Strong listing match available — ${bestProperty.address} (${matchScore}% fit)`
    )
  }
  if (lead.score >= 75) {
    reasons.push(`Lead score ${lead.score}/100 signals serious buying intent`)
  }
  if (lead.intentSignals.includes('cooling_down')) {
    reasons.push('Engagement declining — risk of losing lead to a competing agent')
  }
  return reasons
}

function buildConsequence(lead: Lead, isCooling: boolean): string {
  if (isCooling) return 'Re-engagement window is closing fast — delayed contact may lose the lead permanently'
  if (lead.stage === 'hot') return 'Hot leads expect same-day contact — delay directly risks losing to a competitor'
  if (lead.stage === 'new') return 'First-touch speed is the #1 predictor of new lead conversion'
  return 'Without follow-up, urgency will keep rising while lead motivation fades'
}

function buildListingDraft(lead: Lead, property: Property): string {
  const first = lead.name.split(' ')[0]
  const backOnMarket = property.status === 'back_on_market'
  return [
    `Hi ${first},`,
    '',
    backOnMarket
      ? `I wanted to reach out right away — ${property.address} in ${property.city} just came back on the market and it's a great match for what you're looking for.`
      : `I came across a listing I think you'll love — ${property.address} in ${property.city}.`,
    '',
    `It's a ${property.beds}bd/${property.baths}ba at $${property.price.toLocaleString()} with ${property.sqft.toLocaleString()} sq ft. ${property.tags.slice(0, 2).join(', ')}.`,
    '',
    'Would you like to schedule a showing this week? I have availability and would love to walk you through it.',
    '',
    `— ${lead.assignedAgent}`,
  ].join('\n')
}

function buildContactDraft(lead: Lead, bestProperty: Property | null): string {
  const first = lead.name.split(' ')[0]

  if (lead.intentSignals.includes('showing_request') && bestProperty) {
    return `Hi ${first}, I saw your showing request for ${bestProperty.address} — I'd love to set that up. What days work best for you this week?`
  }
  if (lead.intentSignals.includes('back_to_site') && bestProperty) {
    return `Hi ${first}, I noticed you're back browsing! I have a great match for you — ${bestProperty.address} in ${bestProperty.city}. Want me to send over the details?`
  }
  if (lead.intentSignals.includes('cooling_down')) {
    return `Hi ${first}, I just wanted to check in — has your search timeline changed? I have a few new listings that might be exactly what you're looking for.`
  }
  if (lead.stage === 'new') {
    return `Hi ${first}, welcome! I'm ${lead.assignedAgent}. I saw you were browsing listings — I'd love to learn more about what you're looking for and help narrow down the search. Do you have 10 minutes to chat?`
  }
  return `Hi ${first}, following up on your home search. I have some great new options in ${lead.preferredAreas[0]} that match your criteria — would love to share them. Are you free for a quick call this week?`
}
