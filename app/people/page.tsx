import Link from 'next/link'
import {
  ArrowLeft,
  ChevronRight,
  Flame,
  RotateCcw,
  Search,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { mockEvents, mockLeads, mockProperties, mockTransactions } from '@/lib/mock-data'
import { generateRecommendedActions } from '@/lib/scoring'
import type { Lead } from '@/types/lead'

const actions = generateRecommendedActions(
  mockLeads,
  mockProperties,
  mockEvents,
  mockTransactions,
)

const hotLeads = mockLeads.filter((lead) => lead.stage === 'hot' || lead.score >= 70)
const backToSite = mockLeads.filter((lead) => lead.intentSignals.includes('back_to_site'))
const coolingLeads = mockLeads.filter((lead) => lead.lastContactDaysAgo >= 14)
const newLeads = mockLeads.filter((lead) => lead.stage === 'new' || lead.lastContactDaysAgo === 0)

export default function PeoplePage() {
  return (
    <AppShell>
      <main className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <Link
              href="/dashboard"
              className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-[#1a6bcc] hover:underline"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to overview
            </Link>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#1a6bcc]" />
              <h1 className="text-xl font-bold text-gray-900">People</h1>
              <Badge className="border-0 bg-blue-50 text-[#1a6bcc]">{mockLeads.length} leads</Badge>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              All opportunities, lead scores, and recommended next moves in one place.
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
            <Search className="h-3.5 w-3.5" />
            Filter leads
          </Button>
        </div>

        <div className="mb-5 grid grid-cols-4 gap-3">
          <MetricCard
            label="High Interest"
            value={hotLeads.length}
            sub="Score >= 70"
            icon={Flame}
            color="text-rose-600"
            bg="bg-rose-50"
          />
          <MetricCard
            label="Back to Site"
            value={backToSite.length}
            sub="Returned after absence"
            icon={TrendingUp}
            color="text-amber-600"
            bg="bg-amber-50"
          />
          <MetricCard
            label="New Leads"
            value={newLeads.length}
            sub="Ready for first touch"
            icon={Users}
            color="text-[#1a6bcc]"
            bg="bg-blue-50"
          />
          <MetricCard
            label="Cooling Down"
            value={coolingLeads.length}
            sub="Needs re-engagement"
            icon={RotateCcw}
            color="text-gray-600"
            bg="bg-gray-100"
          />
        </div>

        <section className="mb-5 rounded-2xl border border-gray-100 bg-white shadow-sm">
          <SectionTitle
            icon={<Sparkles className="h-4 w-4" />}
            title="Today's Opportunities"
            count={hotLeads.length + backToSite.length}
          />
          <div className="grid grid-cols-4 gap-px overflow-hidden rounded-xl bg-gray-100 mx-5 mb-4">
            {[
              { label: 'High Interest', value: hotLeads.length, color: 'text-rose-600' },
              { label: 'Back to Site', value: backToSite.length, color: 'text-amber-600' },
              { label: 'Sell Request', value: 1, color: 'text-violet-600' },
              {
                label: 'Back on Market',
                value: mockProperties.filter((property) => property.status === 'back_on_market').length,
                color: 'text-emerald-600',
              },
            ].map((item) => (
              <div key={item.label} className="bg-white px-3 py-3 text-center">
                <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                <p className="text-[10px] leading-tight text-gray-400">{item.label}</p>
              </div>
            ))}
          </div>
          <div className="px-4 pb-4">
            <div className="grid grid-cols-2 gap-3">
              {hotLeads.map((lead) => (
                <LeadCard key={lead.id} lead={lead} />
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <SectionTitle
            icon={<Users className="h-4 w-4" />}
            title="All Leads"
            count={mockLeads.length}
          />
          <div className="px-4 pb-4">
            <div className="overflow-hidden rounded-xl border border-gray-100">
              <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_1.4fr_0.2fr] gap-3 bg-gray-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                <span>Lead</span>
                <span>Stage</span>
                <span>Budget</span>
                <span>Last Contact</span>
                <span>Next Best Move</span>
                <span />
              </div>
              {mockLeads.map((lead) => (
                <LeadRow key={lead.id} lead={lead} />
              ))}
            </div>
          </div>
        </section>
      </main>
    </AppShell>
  )
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  bg,
}: {
  label: string
  value: number
  sub: string
  icon: React.ElementType
  color: string
  bg: string
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between">
        <p className="text-xs font-medium leading-tight text-gray-500">{label}</p>
        <div className={`rounded-xl p-2 ${bg}`}>
          <Icon className={`h-3.5 w-3.5 ${color}`} />
        </div>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-xs text-gray-400">{sub}</p>
    </div>
  )
}

function SectionTitle({
  icon,
  title,
  count,
}: {
  icon: React.ReactNode
  title: string
  count: number
}) {
  return (
    <div className="flex items-center justify-between px-5 pb-4 pt-5">
      <div className="flex items-center gap-2.5">
        <span className="text-gray-400">{icon}</span>
        <span className="text-sm font-semibold text-gray-900">{title}</span>
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-[#1a6bcc]">
          {count}
        </span>
      </div>
    </div>
  )
}

function LeadCard({ lead }: { lead: Lead }) {
  const nextAction = actions.find((action) => action.leadId === lead.id)

  return (
    <div className="rounded-xl border border-gray-100 p-3.5 transition-colors hover:border-[#1a6bcc]/30 hover:bg-blue-50/30">
      <div className="mb-3 flex items-start gap-3">
        <LeadAvatar lead={lead} color="bg-rose-100 text-rose-600" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-gray-900">{lead.name}</p>
            <ScorePill score={lead.score} />
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-500">{lead.recentBehavior[0]}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {lead.intentSignals.slice(0, 3).map((signal) => (
          <span key={signal} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
            {formatSignal(signal)}
          </span>
        ))}
      </div>
      {nextAction && (
        <div className="mt-3 rounded-lg bg-[#1a6bcc]/5 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#1a6bcc]">
            Recommended
          </p>
          <p className="mt-0.5 text-xs font-medium text-gray-700">{nextAction.title}</p>
        </div>
      )}
    </div>
  )
}

function LeadRow({ lead }: { lead: Lead }) {
  const nextAction = actions.find((action) => action.leadId === lead.id)

  return (
    <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_1.4fr_0.2fr] items-center gap-3 border-t border-gray-100 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <LeadAvatar lead={lead} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-gray-900">{lead.name}</p>
            <ScorePill score={lead.score} />
          </div>
          <p className="truncate text-xs text-gray-400">{lead.source} · {lead.email}</p>
        </div>
      </div>
      <span className="text-xs font-medium capitalize text-gray-600">{lead.stage}</span>
      <span className="text-xs font-medium text-gray-700">${(lead.budget / 1000).toFixed(0)}K</span>
      <span className={lead.lastContactDaysAgo >= 7 ? 'text-xs font-semibold text-rose-600' : 'text-xs text-gray-500'}>
        {lead.lastContactDaysAgo === 0 ? 'Today' : `${lead.lastContactDaysAgo}d ago`}
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-gray-700">
          {nextAction?.title ?? 'Keep nurturing'}
        </p>
        <p className="truncate text-[11px] text-gray-400">
          {nextAction?.summary ?? lead.recentBehavior[0]}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 text-gray-300" />
    </div>
  )
}

function LeadAvatar({
  lead,
  color = 'bg-[#1a6bcc]/10 text-[#1a6bcc]',
}: {
  lead: Lead
  color?: string
}) {
  const initials = lead.name.split(' ').map((name) => name[0]).join('').slice(0, 2)

  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${color}`}>
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
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${cls}`}>
      {score}
    </span>
  )
}

function formatSignal(signal: string) {
  return signal.replaceAll('_', ' ')
}
