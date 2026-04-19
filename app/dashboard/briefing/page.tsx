'use client'

import { useState } from 'react'
import { Sparkles, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import DetailPanel from '@/components/layout/DetailPanel'
import { BriefingCard } from '@/components/dashboard/BriefingCard'
import { ActionCard } from '@/components/dashboard/ActionCard'
import { generateRecommendedActions } from '@/lib/scoring'
import { mockLeads, mockProperties, mockEvents, mockTransactions } from '@/lib/mock-data'
import type { RecommendedAction } from '@/types/action'

// ── Live scoring engine ───────────────────────────────────────────────────────

const liveActions = generateRecommendedActions(
  mockLeads,
  mockProperties,
  mockEvents,
  mockTransactions,
)

// ── Page ─────────────────────────────────────────────────────────────────────

export default function BriefingPage() {
  const [selectedAction, setSelectedAction] = useState<RecommendedAction | null>(null)
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())

  const markDone = (id: string) => setDoneIds(prev => new Set([...prev, id]))

  const visibleActions = liveActions.filter(a => !doneIds.has(a.id))

  const lead = selectedAction?.leadId
    ? mockLeads.find(l => l.id === selectedAction.leadId) ?? null
    : null
  const property = selectedAction?.propertyId
    ? mockProperties.find(p => p.id === selectedAction.propertyId) ?? null
    : null
  const transaction = selectedAction?.transactionId
    ? mockTransactions.find(t => t.id === selectedAction.transactionId) ?? null
    : null

  function handleWhyThis(action: RecommendedAction) {
    setSelectedAction(prev => (prev?.id === action.id ? null : action))
  }

  function handleExecute(action: RecommendedAction) {
    markDone(action.id)
    if (selectedAction?.id === action.id) setSelectedAction(null)
  }

  function handleHearBriefing() {
    console.log('[TTS] Hear Briefing — Phase 5A: ElevenLabs integration pending')
  }

  function handleHearAction(action: RecommendedAction) {
    console.log('[TTS] Hear action:', action.title, '— Phase 5A pending')
  }

  return (
    <div className="flex flex-1 min-h-0">
      <main className="flex-1 overflow-y-auto px-6 py-5">

        {/* Hero ─────────────────────────────────────────────────────────── */}
        <BriefingCard
          agentName="James Carter"
          actions={liveActions}
          onHearBriefing={handleHearBriefing}
        />

        {/* Progress bar */}
        {doneIds.size > 0 && (
          <div className="mb-4 flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${(doneIds.size / liveActions.length) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 shrink-0">
              {doneIds.size} of {liveActions.length} done
            </span>
          </div>
        )}

        {/* Action Cards ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Recommended Actions
            <span className="ml-2 text-xs font-normal text-gray-400">ranked by AI priority score</span>
          </h2>
          <Button variant="outline" size="sm" className="text-xs h-7 gap-1">
            <Sparkles className="w-3 h-3" /> Execute My Day
          </Button>
        </div>

        <div className="space-y-3">
          {visibleActions.map((action, idx) => {
            const actionLead = action.leadId
              ? mockLeads.find(l => l.id === action.leadId) ?? null
              : null
            const actionProperty = action.propertyId
              ? mockProperties.find(p => p.id === action.propertyId) ?? null
              : null

            return (
              <ActionCard
                key={action.id}
                action={action}
                rank={idx + 1}
                lead={actionLead}
                property={actionProperty}
                isSelected={selectedAction?.id === action.id}
                isDone={doneIds.has(action.id)}
                onWhyThis={handleWhyThis}
                onExecute={handleExecute}
                onSnooze={() => markDone(action.id)}
                onHearAction={handleHearAction}
              />
            )
          })}

          {doneIds.size === liveActions.length && liveActions.length > 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-3" />
              <p className="text-sm font-semibold text-gray-700">You&apos;re all caught up!</p>
              <p className="text-xs text-gray-400 mt-1">All recommended actions completed for today.</p>
            </div>
          )}
        </div>
      </main>

      {/* Reasoning Panel ───────────────────────────────────────────────── */}
      <DetailPanel
        open={!!selectedAction}
        onClose={() => setSelectedAction(null)}
        title="Why this action?"
      >
        {selectedAction && (
          <div className="space-y-4">
            {/* Priority score + confidence */}
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700">Priority Score</span>
                <span className="text-sm font-bold text-[#1a6bcc]">
                  {Math.round(selectedAction.priorityScore)}/100
                </span>
              </div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">AI Confidence</span>
                <span className="text-xs font-bold text-[#1a6bcc]">
                  {Math.round(selectedAction.confidence)}%
                </span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#1a6bcc] rounded-full transition-all"
                  style={{ width: `${Math.round(selectedAction.confidence)}%` }}
                />
              </div>
            </div>

            {/* Lead context */}
            {lead && (
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-xs font-semibold text-gray-700 mb-2">Lead Context</p>
                <div className="space-y-1">
                  <Row label="Name" value={lead.name} />
                  <Row label="Score" value={String(lead.score)} highlight />
                  <Row label="Budget" value={`$${(lead.budget / 1000).toFixed(0)}K`} />
                  <Row
                    label="Last Contact"
                    value={`${lead.lastContactDaysAgo}d ago`}
                    highlight={lead.lastContactDaysAgo >= 5}
                  />
                </div>
                {lead.recentBehavior.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <p className="text-[10px] text-gray-400 font-medium mb-1.5">Recent behavior</p>
                    {lead.recentBehavior.map((b, i) => (
                      <p key={i} className="text-xs text-gray-600 flex items-start gap-1.5 mb-1">
                        <span className="text-[#1a6bcc] mt-0.5">·</span>{b}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Property match */}
            {property && (
              <div className="p-3 bg-blue-50 rounded-xl">
                <p className="text-xs font-semibold text-blue-800 mb-2">Matched Property</p>
                <p className="text-xs font-medium text-blue-900">
                  {property.address}, {property.city}
                </p>
                <p className="text-xs text-blue-600">
                  {property.beds}bd · {property.baths}ba · ${(property.price / 1000).toFixed(0)}K
                </p>
                {property.status === 'back_on_market' && (
                  <Badge className="mt-1.5 bg-blue-200 text-blue-800 text-[10px]">
                    Back on Market
                  </Badge>
                )}
              </div>
            )}

            {/* Transaction alert */}
            {transaction && (
              <div className="p-3 bg-orange-50 rounded-xl">
                <p className="text-xs font-semibold text-orange-800 mb-1">Transaction Alert</p>
                <p className="text-xs text-orange-700">{transaction.nextDeadlineLabel}</p>
                <p className="text-xs font-bold text-red-600 mt-1">
                  {transaction.daysUntilDeadline <= 1
                    ? '⚠ Tomorrow'
                    : `${transaction.daysUntilDeadline} days left`}
                </p>
              </div>
            )}

            {/* AI reasons */}
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">Why now</p>
              <div className="space-y-2">
                {selectedAction.reasons.map((r, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="w-4 h-4 rounded-full bg-[#1a6bcc]/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[9px] font-bold text-[#1a6bcc]">{i + 1}</span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">{r}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* If ignored */}
            {selectedAction.consequenceIfIgnored && (
              <div className="p-3 bg-red-50 rounded-xl border border-red-100">
                <p className="text-xs font-semibold text-red-700 mb-1">If ignored</p>
                <p className="text-xs text-red-600">{selectedAction.consequenceIfIgnored}</p>
              </div>
            )}

            {/* Draft message */}
            {selectedAction.draftMessage && (
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-xs font-semibold text-gray-700 mb-1.5">AI Draft Message</p>
                <p className="text-xs text-gray-600 italic leading-relaxed">
                  &ldquo;{selectedAction.draftMessage}&rdquo;
                </p>
                <Button
                  size="sm"
                  className="mt-2 h-6 text-[11px] bg-[#1a6bcc] hover:bg-[#1558a8] text-white border-0"
                  onClick={() => console.log('[Draft] Use draft:', selectedAction.draftMessage)}
                >
                  Use This Draft
                </Button>
              </div>
            )}
          </div>
        )}
      </DetailPanel>
    </div>
  )
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-gray-400">{label}</span>
      <span className={`text-xs font-medium ${highlight ? 'text-rose-600' : 'text-gray-700'}`}>
        {value}
      </span>
    </div>
  )
}
