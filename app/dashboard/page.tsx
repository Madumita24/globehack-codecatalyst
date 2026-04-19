'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Sparkles, TrendingUp, Clock, Users, Phone, Mail, MessageSquare,
  ArrowRight, CalendarDays, Home, Flame, RotateCcw, Tag, ChevronRight,
  Send, AlertTriangle, CheckCircle2, X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { BriefingCard } from '@/components/dashboard/BriefingCard'
import { ActionCard } from '@/components/dashboard/ActionCard'
import { ActionExecutionDialog } from '@/components/dashboard/ActionExecutionDialog'
import { VoiceOrb } from '@/components/voice/VoiceOrb'
import { mockLeads, mockTransactions, mockTasks, mockProperties, mockEvents, agentProfile } from '@/lib/mock-data'
import { generateRecommendedActions } from '@/lib/scoring'
import { useVoice } from '@/hooks/useVoice'
import { getBriefingScript, getActionScript, getConfirmationScript } from '@/lib/voice-scripts'
import type { Lead } from '@/types/lead'
import type { RecommendedAction, Transaction } from '@/types/action'

// ── Scoring engine — deterministic, called once at render ────────────────────

const topActions = generateRecommendedActions(
  mockLeads,
  mockProperties,
  mockEvents,
  mockTransactions,
)

// ── Panel state type ─────────────────────────────────────────────────────────

type PanelContent =
  | { kind: 'lead'; data: Lead }
  | { kind: 'transaction'; data: Transaction }
  | { kind: 'action'; data: RecommendedAction }
  | null

// ── Inline helpers ────────────────────────────────────────────────────────────

function Avatar({
  name,
  color = 'bg-[#1a6bcc]/10 text-[#1a6bcc]',
  size = 'md',
}: {
  name: string
  color?: string
  size?: 'sm' | 'md'
}) {
  const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2)
  const sz = size === 'sm' ? 'w-7 h-7 text-[11px]' : 'w-9 h-9 text-xs'
  return (
    <div className={`${sz} rounded-full ${color} flex items-center justify-center font-bold shrink-0`}>
      {initials}
    </div>
  )
}

function ScorePill({ score }: { score: number }) {
  const cls =
    score >= 75
      ? 'bg-emerald-100 text-emerald-700'
      : score >= 50
        ? 'bg-amber-100 text-amber-700'
        : 'bg-gray-100 text-gray-500'
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${cls}`}>
      {score}
    </span>
  )
}

function UrgencyBadge({ days }: { days: number }) {
  if (days <= 1)
    return (
      <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
        Tomorrow
      </span>
    )
  if (days <= 3)
    return (
      <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
        {days}d left
      </span>
    )
  return <span className="text-xs text-gray-400">{days}d left</span>
}

function SectionHeader({
  icon,
  title,
  count,
  countColor = 'bg-gray-100 text-gray-500',
  href,
}: {
  icon: React.ReactNode
  title: string
  count?: number
  countColor?: string
  href?: string
}) {
  return (
    <div className="flex items-center justify-between px-5 pt-5 pb-4">
      <div className="flex items-center gap-2.5">
        <span className="text-gray-400">{icon}</span>
        <span className="font-semibold text-gray-900 text-sm">{title}</span>
        {count !== undefined && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${countColor}`}>
            {count}
          </span>
        )}
      </div>
      {href && (
        <Link
          href={href}
          className="text-xs text-[#1a6bcc] flex items-center gap-0.5 hover:underline"
        >
          View all <ChevronRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  )
}

const TASK_ICON_MAP = {
  call:  { icon: Phone,         color: 'text-blue-600',    bg: 'bg-blue-50'    },
  text:  { icon: MessageSquare, color: 'text-violet-600',  bg: 'bg-violet-50'  },
  email: { icon: Mail,          color: 'text-emerald-600', bg: 'bg-emerald-50' },
  other: { icon: Tag,           color: 'text-gray-500',    bg: 'bg-gray-50'    },
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [panel, setPanel] = useState<PanelContent>(null)
  const [executionAction, setExecutionAction] = useState<RecommendedAction | null>(null)
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const { state: voiceState, activeId: voiceActiveId, speak, stop } = useVoice()

  // Derived data for context widgets
  const hotLeads       = mockLeads.filter((l) => l.stage === 'hot' || l.score >= 70)
  const backToSite     = mockLeads.filter((l) => l.intentSignals.includes('back_to_site'))
  const coolingLeads   = mockLeads.filter((l) => l.lastContactDaysAgo >= 14)
  const pendingTasks   = mockTasks.filter((t) => !t.completed)
  const urgentTx       = mockTransactions.filter((t) => t.daysUntilDeadline <= 3)
  const backOnMarket   = mockProperties.filter((p) => p.status === 'back_on_market')

  const markDone = useCallback(
    (action: RecommendedAction) => {
      setDoneIds((prev) => new Set([...prev, action.id]))
      speak(getConfirmationScript(action), `confirm-${action.id}`)
    },
    [speak],
  )

  const completeExecution = useCallback(
    (action: RecommendedAction) => {
      markDone(action)
      setPanel((prev) =>
        prev?.kind === 'action' && prev.data.id === action.id ? null : prev
      )
    },
    [markDone],
  )

  const openWhyThis = (action: RecommendedAction) =>
    setPanel((prev) =>
      prev?.kind === 'action' && prev.data.id === action.id
        ? null
        : { kind: 'action', data: action }
    )

  const hearBriefing = useCallback(() => {
    speak(getBriefingScript(agentProfile.name, topActions), 'briefing')
  }, [speak])

  const hearAction = useCallback(
    (action: RecommendedAction) => {
      const lead     = action.leadId     ? mockLeads.find((l) => l.id === action.leadId)          : null
      const property = action.propertyId ? mockProperties.find((p) => p.id === action.propertyId) : null
      speak(getActionScript(action, lead, property), `action-${action.id}`)
    },
    [speak],
  )

  const executionLead = executionAction?.leadId
    ? mockLeads.find((l) => l.id === executionAction.leadId) ?? null
    : null
  const executionProperty = executionAction?.propertyId
    ? mockProperties.find((p) => p.id === executionAction.propertyId) ?? null
    : null
  const executionTransaction = executionAction?.transactionId
    ? mockTransactions.find((t) => t.id === executionAction.transactionId) ?? null
    : null

  return (
    <div className="flex flex-1 min-h-0">
      <main className="flex-1 overflow-y-auto px-6 py-5 min-w-0">

        {/* ── AI Briefing Hero ──────────────────────────────────────────── */}
        <BriefingCard
          agentName={agentProfile.name}
          actions={topActions}
          isSpeaking={voiceActiveId === 'briefing' && voiceState === 'playing'}
          isLoading={voiceActiveId === 'briefing' && voiceState === 'loading'}
          onHearBriefing={hearBriefing}
        />

        {/* ── Stat Strip ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            {
              label: 'New Leads Today',
              value: mockLeads.filter((l) => l.lastContactDaysAgo === 0).length,
              sub: '1 untouched',
              icon: Users,
              color: 'text-blue-600',
              bg: 'bg-blue-50',
              ring: 'hover:ring-blue-200',
            },
            {
              label: 'High Interest',
              value: hotLeads.length,
              sub: 'Score ≥ 70',
              icon: Flame,
              color: 'text-rose-600',
              bg: 'bg-rose-50',
              ring: 'hover:ring-rose-200',
            },
            {
              label: 'Tx Deadlines',
              value: urgentTx.length,
              sub: 'Next 72 hours',
              icon: AlertTriangle,
              color: 'text-orange-600',
              bg: 'bg-orange-50',
              ring: 'hover:ring-orange-200',
            },
            {
              label: 'Back on Market',
              value: backOnMarket.length,
              sub: 'Match your buyers',
              icon: RotateCcw,
              color: 'text-emerald-600',
              bg: 'bg-emerald-50',
              ring: 'hover:ring-emerald-200',
            },
          ].map((c) => (
            <div
              key={c.label}
              className={`bg-white rounded-2xl p-4 border border-gray-100 shadow-sm cursor-pointer hover:shadow-md hover:ring-2 ${c.ring} transition-all duration-150`}
            >
              <div className="flex items-start justify-between mb-3">
                <p className="text-xs font-medium text-gray-500 leading-tight">{c.label}</p>
                <div className={`${c.bg} p-2 rounded-xl`}>
                  <c.icon className={`w-3.5 h-3.5 ${c.color}`} />
                </div>
              </div>
              <p className="text-3xl font-bold text-gray-900">{c.value}</p>
              <p className="text-xs text-gray-400 mt-1">{c.sub}</p>
            </div>
          ))}
        </div>

        {/* ── AI Top Actions ─────────────────────────────────────────────── */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-[#1a6bcc]" />
              <span className="text-xs font-semibold text-[#1a6bcc] uppercase tracking-wider">
                AI Top Actions · Start here
              </span>
              <span className="text-xs text-gray-400">
                ranked by priority score
              </span>
            </div>
            <Link href="/dashboard/briefing">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                <ArrowRight className="w-3 h-3" />
                Full Briefing
              </Button>
            </Link>
          </div>

          <div className="space-y-3">
            {topActions.map((action, idx) => {
              const lead = action.leadId
                ? mockLeads.find((l) => l.id === action.leadId) ?? null
                : null
              const property = action.propertyId
                ? mockProperties.find((p) => p.id === action.propertyId) ?? null
                : null
              const isSelected =
                panel?.kind === 'action' && panel.data.id === action.id

              const actionVoiceId = `action-${action.id}`
              return (
                <ActionCard
                  key={action.id}
                  action={action}
                  rank={idx + 1}
                  lead={lead}
                  property={property}
                  isSelected={isSelected}
                  isDone={doneIds.has(action.id)}
                  isSpeaking={voiceActiveId === actionVoiceId && voiceState === 'playing'}
                  isVoiceLoading={voiceActiveId === actionVoiceId && voiceState === 'loading'}
                  onWhyThis={openWhyThis}
                  onExecute={setExecutionAction}
                  onSnooze={() => setPanel(null)}
                  onHearAction={hearAction}
                />
              )
            })}
          </div>
        </div>

        {/* ── Context Widgets ────────────────────────────────────────────── */}
        <div className="grid grid-cols-5 gap-4">

          {/* Left 3/5 ───────────────────────────────────────────────────── */}
          <div className="col-span-3 space-y-4">

            {/* Today's Opportunities */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <SectionHeader
                icon={<TrendingUp className="w-4 h-4" />}
                title="Today's Opportunities"
                count={hotLeads.length + backToSite.length}
                countColor="bg-rose-50 text-rose-600"
                href="/people"
              />
              <div className="grid grid-cols-4 gap-px bg-gray-100 mx-5 mb-5 rounded-xl overflow-hidden">
                {[
                  { label: 'High Interest',  value: hotLeads.length,    color: 'text-rose-600'    },
                  { label: 'Back to Site',   value: backToSite.length,  color: 'text-amber-600'   },
                  { label: 'Sell Request',   value: 1,                  color: 'text-violet-600'  },
                  { label: 'Back on Market', value: backOnMarket.length, color: 'text-emerald-600' },
                ].map((s) => (
                  <div key={s.label} className="bg-white px-3 py-2.5 text-center">
                    <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-gray-400 leading-tight">{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="px-4 pb-4 space-y-1">
                {hotLeads.map((lead) => (
                  <button
                    key={lead.id}
                    onClick={() => setPanel({ kind: 'lead', data: lead })}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-blue-50/60 hover:border-l-2 hover:border-l-[#1a6bcc] transition-all duration-100 group text-left"
                  >
                    <Avatar name={lead.name} color="bg-rose-100 text-rose-600" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">{lead.name}</p>
                        {lead.intentSignals.includes('back_to_site') && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                            Back to Site
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {lead.recentBehavior[0]}
                      </p>
                    </div>
                    <ScorePill score={lead.score} />
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#1a6bcc] transition-colors shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            {/* All Leads */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <SectionHeader
                icon={<Users className="w-4 h-4" />}
                title="All Leads"
                count={mockLeads.length}
                countColor="bg-blue-50 text-blue-600"
                href="/people"
              />
              <div className="px-4 pb-4 space-y-1">
                {mockLeads.map((lead) => (
                  <button
                    key={lead.id}
                    onClick={() => setPanel({ kind: 'lead', data: lead })}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-blue-50/60 transition-all duration-100 group text-left"
                  >
                    <Avatar name={lead.name} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{lead.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {lead.source} · {lead.preferences.minBeds}–{lead.preferences.maxBeds} bed
                        · ${(lead.budget / 1000).toFixed(0)}K
                      </p>
                    </div>
                    <ScorePill score={lead.score} />
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#1a6bcc] transition-colors shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right 2/5 ──────────────────────────────────────────────────── */}
          <div className="col-span-2 space-y-4">

            {/* Transactions */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <SectionHeader
                icon={<Clock className="w-4 h-4" />}
                title="Transactions"
                count={mockTransactions.length}
                countColor="bg-orange-50 text-orange-600"
                href="/transactions"
              />
              <div className="px-4 pb-4 space-y-2">
                {mockTransactions.map((tx) => (
                  <button
                    key={tx.id}
                    onClick={() => setPanel({ kind: 'transaction', data: tx })}
                    className="w-full text-left p-3.5 rounded-xl border border-gray-100 hover:border-[#1a6bcc]/40 hover:bg-blue-50/30 transition-all duration-100 group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div
                        className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                          tx.daysUntilDeadline <= 1
                            ? 'bg-red-500'
                            : tx.daysUntilDeadline <= 3
                              ? 'bg-amber-400'
                              : 'bg-emerald-400'
                        }`}
                      />
                      <p className="text-sm font-medium text-gray-800 flex-1 leading-tight line-clamp-1">
                        {tx.address}
                      </p>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#1a6bcc] shrink-0 mt-0.5 transition-colors" />
                    </div>
                    <div className="flex items-center justify-between pl-4">
                      <span className="text-xs text-gray-400">{tx.nextDeadlineLabel}</span>
                      <UrgencyBadge days={tx.daysUntilDeadline} />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Today's Tasks */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <SectionHeader
                icon={<CheckCircle2 className="w-4 h-4" />}
                title="Today's Tasks"
                count={pendingTasks.length}
                countColor="bg-violet-50 text-violet-600"
              />
              <div className="px-4 pb-2">
                <div className="flex gap-2 mb-3">
                  {(['call', 'text', 'email', 'other'] as const).map((type) => {
                    const m = TASK_ICON_MAP[type]
                    const count = mockTasks.filter((t) => t.type === type && !t.completed).length
                    return (
                      <div key={type} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl ${m.bg}`}>
                        <m.icon className={`w-3 h-3 ${m.color}`} />
                        <span className={`text-sm font-bold ${m.color}`}>{count}</span>
                      </div>
                    )
                  })}
                </div>
                {mockTasks.map((task) => {
                  const m = TASK_ICON_MAP[task.type]
                  const lead = mockLeads.find((l) => l.id === task.leadId)
                  return (
                    <div
                      key={task.id}
                      className={`flex items-center gap-3 px-2 py-2.5 rounded-xl ${
                        task.completed ? 'opacity-35' : 'hover:bg-gray-50 cursor-pointer'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${m.bg}`}>
                        <m.icon className={`w-3.5 h-3.5 ${m.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate font-medium">{task.title}</p>
                        {lead && <p className="text-xs text-gray-400">{lead.name}</p>}
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{task.dueTime}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Keep in Touch */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <SectionHeader
                icon={<Users className="w-4 h-4" />}
                title="Keep in Touch"
                count={3}
                countColor="bg-amber-50 text-amber-600"
              />
              <div className="px-4 pb-4 space-y-1">
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                    Birthday
                  </span>
                  <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    8 this month
                  </span>
                </div>
                {mockLeads.slice(0, 2).map((lead) => (
                  <button
                    key={lead.id}
                    onClick={() => setPanel({ kind: 'lead', data: lead })}
                    className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-amber-50/50 transition-all group text-left"
                  >
                    <Avatar name={lead.name} color="bg-amber-100 text-amber-600" size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{lead.name}</p>
                      <p className="text-xs text-gray-400">Follow-up every 14 days</p>
                    </div>
                    <span className="text-xs font-semibold text-amber-600">
                      {lead.lastContactDaysAgo}d ago
                    </span>
                  </button>
                ))}
                <Separator className="my-2" />
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                    Cooling down
                  </span>
                </div>
                {coolingLeads.slice(0, 1).map((lead) => (
                  <button
                    key={lead.id}
                    onClick={() => setPanel({ kind: 'lead', data: lead })}
                    className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-red-50/50 transition-all group text-left"
                  >
                    <Avatar name={lead.name} color="bg-gray-100 text-gray-500" size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700">{lead.name}</p>
                      <p className="text-xs text-gray-400">
                        No contact in {lead.lastContactDaysAgo} days
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-red-500">Cooling</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Appointments + Hot Sheets */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <SectionHeader
                icon={<CalendarDays className="w-4 h-4" />}
                title="Appointments"
                count={2}
              />
              <div className="px-4 pb-4 space-y-1.5">
                {[
                  { name: 'Robert Nguyen', addr: '182 Saint Peter St', time: '11 AM' },
                  { name: 'Annette Black', addr: '26096 Dougherty Pl', time: '2 PM' },
                ].map((a) => (
                  <div
                    key={a.name}
                    className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-gray-50 cursor-pointer"
                  >
                    <div className="w-1 h-9 bg-[#1a6bcc] rounded-full shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{a.name}</p>
                      <p className="text-xs text-gray-400 truncate">{a.addr}</p>
                    </div>
                    <span className="text-xs font-semibold text-[#1a6bcc] shrink-0">{a.time}</span>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="px-4 pb-4 pt-3">
                <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-3">
                  Hot Sheets
                </p>
                <div className="space-y-2">
                  {[
                    { label: 'Upcoming Open House', count: 758, color: 'text-[#1a6bcc]' },
                    { label: 'Back on Market',       count: 20,  color: 'text-emerald-600' },
                    { label: 'Price Reduced',         count: 120, color: 'text-amber-600'  },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="flex items-center justify-between py-0.5 hover:bg-gray-50 rounded-lg px-2 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Home className="w-3.5 h-3.5 text-gray-300" />
                        <span className="text-sm text-gray-600">{s.label}</span>
                      </div>
                      <span className={`text-sm font-bold ${s.color}`}>{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Voice Orb ─────────────────────────────────────────────────────── */}
      <VoiceOrb
        voiceState={voiceState}
        onActivate={hearBriefing}
        onStop={stop}
      />

      {executionAction && (
        <ActionExecutionDialog
          key={executionAction.id}
          open
          action={executionAction}
          lead={executionLead}
          property={executionProperty}
          transaction={executionTransaction}
          onClose={() => setExecutionAction(null)}
          onConfirm={completeExecution}
        />
      )}

      {/* ── Detail Panel ──────────────────────────────────────────────────── */}
      {panel && (
        <aside className="w-80 shrink-0 bg-white border-l border-gray-100 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#1a6bcc]" />
              <span className="text-sm font-semibold text-gray-900">
                {panel.kind === 'lead'
                  ? panel.data.name
                  : panel.kind === 'transaction'
                    ? 'Transaction'
                    : 'AI Reasoning'}
              </span>
            </div>
            <button
              onClick={() => setPanel(null)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {panel.kind === 'lead' && <LeadDetailPanel lead={panel.data} />}
            {panel.kind === 'transaction' && <TransactionDetailPanel tx={panel.data} />}
            {panel.kind === 'action' && <ActionReasoningPanel action={panel.data} />}
          </div>
        </aside>
      )}
    </div>
  )
}

// ── Lead Detail Panel ─────────────────────────────────────────────────────────

function LeadDetailPanel({ lead }: { lead: Lead }) {
  const matchedProperty =
    mockProperties.find(
      (p) =>
        p.price <= lead.budget * 1.1 &&
        p.beds >= lead.preferences.minBeds &&
        lead.preferredAreas.some((a) => p.city.includes(a) || a.includes(p.city))
    ) ?? mockProperties[0]

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-[#1a6bcc]/10 flex items-center justify-center text-lg font-bold text-[#1a6bcc]">
          {lead.name.split(' ').map((n) => n[0]).join('')}
        </div>
        <div>
          <p className="font-bold text-gray-900">{lead.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <ScorePill score={lead.score} />
            <span className="text-xs text-gray-400 capitalize">{lead.stage} lead</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: Phone,         label: 'Call',  color: 'bg-blue-600 hover:bg-blue-700'    },
          { icon: MessageSquare, label: 'Text',  color: 'bg-violet-600 hover:bg-violet-700' },
          { icon: Mail,          label: 'Email', color: 'bg-emerald-600 hover:bg-emerald-700' },
        ].map((a) => (
          <button
            key={a.label}
            className={`${a.color} text-white rounded-xl py-2 flex flex-col items-center gap-1 transition-colors`}
          >
            <a.icon className="w-4 h-4" />
            <span className="text-xs font-medium">{a.label}</span>
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Contact</p>
        {[
          { label: 'Phone',        value: lead.phone },
          { label: 'Email',        value: lead.email },
          { label: 'Budget',       value: `$${(lead.budget / 1000).toFixed(0)}K` },
          { label: 'Source',       value: lead.source },
          { label: 'Last Contact', value: lead.lastContactDaysAgo === 0 ? 'Today' : `${lead.lastContactDaysAgo}d ago`, highlight: lead.lastContactDaysAgo >= 5 },
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <span className="text-xs text-gray-500">{row.label}</span>
            <span className={`text-xs font-medium truncate max-w-44 ${'highlight' in row && row.highlight ? 'text-red-500' : 'text-gray-800'}`}>
              {row.value}
            </span>
          </div>
        ))}
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Recent Activity
        </p>
        <div className="space-y-2">
          {lead.recentBehavior.map((b, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#1a6bcc] mt-1.5 shrink-0" />
              <p className="text-xs text-gray-600 leading-relaxed">{b}</p>
            </div>
          ))}
        </div>
      </div>

      {matchedProperty && (
        <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-100">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-[#1a6bcc]" />
            <p className="text-xs font-semibold text-[#1a6bcc]">AI Best Match</p>
          </div>
          <p className="text-sm font-semibold text-gray-900">{matchedProperty.address}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {matchedProperty.city} · {matchedProperty.beds}bd {matchedProperty.baths}ba ·
            ${(matchedProperty.price / 1000).toFixed(0)}K
          </p>
          {matchedProperty.status === 'back_on_market' && (
            <Badge className="mt-1.5 bg-emerald-100 text-emerald-700 text-[10px]">
              Back on Market
            </Badge>
          )}
          <Button
            size="sm"
            className="w-full mt-3 h-7 text-xs bg-[#1a6bcc] hover:bg-[#1558a8] text-white border-0 gap-1"
          >
            <Send className="w-3 h-3" /> Send This Listing
          </Button>
        </div>
      )}
    </>
  )
}

// ── Transaction Detail Panel ──────────────────────────────────────────────────

function TransactionDetailPanel({ tx }: { tx: Transaction }) {
  const stageColors: Record<string, string> = {
    offer:      'bg-blue-100 text-blue-700',
    inspection: 'bg-amber-100 text-amber-700',
    appraisal:  'bg-violet-100 text-violet-700',
    closing:    'bg-orange-100 text-orange-700',
    closed:     'bg-emerald-100 text-emerald-700',
  }

  return (
    <>
      <div>
        <p className="text-sm font-bold text-gray-900 leading-snug">{tx.address}</p>
        <div className="flex items-center gap-2 mt-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${stageColors[tx.stage]}`}>
            {tx.stage}
          </span>
          <span className="text-xs text-gray-400">${(tx.salePrice / 1000).toFixed(0)}K</span>
        </div>
      </div>

      <div
        className={`p-3.5 rounded-xl border ${
          tx.daysUntilDeadline <= 1 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle
            className={`w-3.5 h-3.5 ${tx.daysUntilDeadline <= 1 ? 'text-red-600' : 'text-amber-600'}`}
          />
          <p className={`text-xs font-semibold ${tx.daysUntilDeadline <= 1 ? 'text-red-700' : 'text-amber-700'}`}>
            Upcoming Deadline
          </p>
        </div>
        <p className="text-sm font-bold text-gray-900">{tx.nextDeadlineLabel}</p>
        <p className={`text-sm font-bold mt-0.5 ${tx.daysUntilDeadline <= 1 ? 'text-red-600' : 'text-amber-600'}`}>
          {tx.daysUntilDeadline === 0
            ? 'Due today'
            : tx.daysUntilDeadline === 1
              ? 'Tomorrow'
              : `In ${tx.daysUntilDeadline} days`}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Timeline</p>
        {[
          { label: 'Deadline', value: tx.nextDeadline },
          { label: 'Closing',  value: tx.closingDate  },
          { label: 'Agent',    value: tx.agentName    },
        ].map((r) => (
          <div key={r.label} className="flex items-center justify-between">
            <span className="text-xs text-gray-500">{r.label}</span>
            <span className="text-xs font-medium text-gray-800">{r.value}</span>
          </div>
        ))}
      </div>

      <Button className="w-full bg-[#1a6bcc] hover:bg-[#1558a8] text-white border-0 gap-1.5">
        <CheckCircle2 className="w-4 h-4" /> Acknowledge Deadline
      </Button>
    </>
  )
}

// ── Action Reasoning Panel ────────────────────────────────────────────────────

function ActionReasoningPanel({ action }: { action: RecommendedAction }) {
  const lead     = action.leadId       ? mockLeads.find((l) => l.id === action.leadId)          : null
  const property = action.propertyId   ? mockProperties.find((p) => p.id === action.propertyId) : null
  const tx       = action.transactionId ? mockTransactions.find((t) => t.id === action.transactionId) : null
  const confidence = Math.round(action.confidence)

  return (
    <>
      {/* Score + confidence */}
      <div className="p-3.5 rounded-xl bg-[#1a6bcc]/5 border border-[#1a6bcc]/10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-[#1a6bcc]">Priority Score</span>
          <span className="text-lg font-bold text-[#1a6bcc]">{action.priorityScore}/100</span>
        </div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500">AI Confidence</span>
          <span className="text-xs font-bold text-[#1a6bcc]">{confidence}%</span>
        </div>
        <div className="h-1.5 bg-white rounded-full overflow-hidden">
          <div
            className="h-full bg-[#1a6bcc] rounded-full"
            style={{ width: `${confidence}%` }}
          />
        </div>
      </div>

      {/* Lead context */}
      {lead && (
        <div className="p-3 bg-gray-50 rounded-xl">
          <p className="text-xs font-semibold text-gray-700 mb-2">Lead Context</p>
          <div className="space-y-1.5">
            {[
              { label: 'Name',         value: lead.name,                                                         },
              { label: 'Lead Score',   value: String(lead.score),         highlight: true                        },
              { label: 'Budget',       value: `$${(lead.budget / 1000).toFixed(0)}K`                             },
              { label: 'Last Contact', value: `${lead.lastContactDaysAgo}d ago`, highlight: lead.lastContactDaysAgo >= 5 },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400">{r.label}</span>
                <span className={`text-xs font-medium ${r.highlight ? 'text-rose-600' : 'text-gray-700'}`}>
                  {r.value}
                </span>
              </div>
            ))}
          </div>
          {lead.recentBehavior.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              <p className="text-[10px] text-gray-400 font-medium mb-1.5">Recent behavior</p>
              {lead.recentBehavior.map((b, i) => (
                <p key={i} className="text-xs text-gray-600 flex items-start gap-1.5 mb-1 leading-relaxed">
                  <span className="text-[#1a6bcc] mt-0.5 shrink-0">·</span>
                  {b}
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

      {/* Transaction */}
      {tx && (
        <div className="p-3 bg-orange-50 rounded-xl">
          <p className="text-xs font-semibold text-orange-800 mb-1">Transaction Alert</p>
          <p className="text-xs text-orange-700">{tx.nextDeadlineLabel}</p>
          <p className="text-xs font-bold text-red-600 mt-1">
            {tx.daysUntilDeadline <= 1 ? '⚠ Tomorrow' : `${tx.daysUntilDeadline} days left`}
          </p>
        </div>
      )}

      {/* Why now */}
      <div>
        <p className="text-xs font-semibold text-gray-700 mb-2">Why now</p>
        <div className="space-y-2">
          {action.reasons.map((r, i) => (
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
      {action.consequenceIfIgnored && (
        <div className="p-3 bg-red-50 rounded-xl border border-red-100">
          <p className="text-xs font-semibold text-red-700 mb-1">If ignored</p>
          <p className="text-xs text-red-600 leading-relaxed">{action.consequenceIfIgnored}</p>
        </div>
      )}

      {/* Draft message */}
      {action.draftMessage && (
        <div className="p-3 bg-gray-50 rounded-xl">
          <p className="text-xs font-semibold text-gray-700 mb-2">Draft Message</p>
          <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">
            {action.draftMessage}
          </p>
          <Button
            size="sm"
            className="w-full mt-3 h-7 text-xs bg-[#1a6bcc] hover:bg-[#1558a8] text-white border-0"
          >
            Use This Draft
          </Button>
        </div>
      )}
    </>
  )
}
