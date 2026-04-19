import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
  FileText,
} from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { mockLeads, mockTransactions } from '@/lib/mock-data'
import type { Transaction } from '@/types/action'

const urgentTransactions = mockTransactions.filter((tx) => tx.daysUntilDeadline <= 3)
const closingSoon = mockTransactions.filter((tx) => {
  const closingDate = new Date(`${tx.closingDate}T00:00:00`)
  const now = new Date('2026-04-18T00:00:00')
  const days = Math.round((closingDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
  return days <= 14
})

export default function TransactionsPage() {
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
              <Clock className="h-5 w-5 text-orange-600" />
              <h1 className="text-xl font-bold text-gray-900">Transactions</h1>
              <Badge className="border-0 bg-orange-50 text-orange-600">
                {mockTransactions.length} active
              </Badge>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Deal deadlines, next required steps, and closing risk in one focused view.
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
            <FileText className="h-3.5 w-3.5" />
            Export timeline
          </Button>
        </div>

        <div className="mb-5 grid grid-cols-4 gap-3">
          <MetricCard
            label="Urgent Deadlines"
            value={urgentTransactions.length}
            sub="Next 72 hours"
            icon={AlertTriangle}
            color="text-orange-600"
            bg="bg-orange-50"
          />
          <MetricCard
            label="Closing Soon"
            value={closingSoon.length}
            sub="Within 14 days"
            icon={CalendarDays}
            color="text-[#1a6bcc]"
            bg="bg-blue-50"
          />
          <MetricCard
            label="Pipeline Value"
            value={Math.round(mockTransactions.reduce((sum, tx) => sum + tx.salePrice, 0) / 1000)}
            suffix="K"
            sub="Active volume"
            icon={DollarSign}
            color="text-emerald-600"
            bg="bg-emerald-50"
          />
          <MetricCard
            label="Needs Review"
            value={mockTransactions.length}
            sub="Open transaction files"
            icon={FileText}
            color="text-violet-600"
            bg="bg-violet-50"
          />
        </div>

        <section className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between px-5 pb-4 pt-5">
            <div className="flex items-center gap-2.5">
              <span className="text-gray-400">
                <Clock className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold text-gray-900">All Transactions</span>
              <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-bold text-orange-600">
                {mockTransactions.length}
              </span>
            </div>
          </div>

          <div className="px-4 pb-4">
            <div className="space-y-3">
              {mockTransactions.map((transaction) => (
                <TransactionCard key={transaction.id} transaction={transaction} />
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
  suffix = '',
  sub,
  icon: Icon,
  color,
  bg,
}: {
  label: string
  value: number
  suffix?: string
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
      <p className="text-3xl font-bold text-gray-900">
        {value}
        {suffix && <span className="text-xl">{suffix}</span>}
      </p>
      <p className="mt-1 text-xs text-gray-400">{sub}</p>
    </div>
  )
}

function TransactionCard({ transaction }: { transaction: Transaction }) {
  const lead = mockLeads.find((item) => item.id === transaction.leadId)
  const urgent = transaction.daysUntilDeadline <= 1
  const soon = transaction.daysUntilDeadline <= 3

  return (
    <div className="rounded-2xl border border-gray-100 p-4 transition-colors hover:border-[#1a6bcc]/30 hover:bg-blue-50/20">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
              urgent ? 'bg-red-500' : soon ? 'bg-amber-400' : 'bg-emerald-400'
            }`}
          />
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-bold text-gray-900">{transaction.address}</h2>
              <StageBadge stage={transaction.stage} />
              {urgent && (
                <Badge className="border-0 bg-red-100 text-red-700">Critical</Badge>
              )}
            </div>
            <p className="text-sm text-gray-500">
              {lead?.name ?? 'Assigned lead'} · {transaction.agentName}
            </p>
          </div>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-gray-300" />
      </div>

      <div className="grid grid-cols-4 gap-3">
        <InfoBlock
          icon={<AlertTriangle className={urgent ? 'h-3.5 w-3.5 text-red-600' : 'h-3.5 w-3.5 text-amber-600'} />}
          label="Next Deadline"
          value={transaction.nextDeadlineLabel}
          sub={urgent ? 'Tomorrow' : `In ${transaction.daysUntilDeadline} days`}
          danger={urgent}
        />
        <InfoBlock
          icon={<CalendarDays className="h-3.5 w-3.5 text-[#1a6bcc]" />}
          label="Closing"
          value={transaction.closingDate}
          sub="Target date"
        />
        <InfoBlock
          icon={<DollarSign className="h-3.5 w-3.5 text-emerald-600" />}
          label="Sale Price"
          value={`$${transaction.salePrice.toLocaleString()}`}
          sub="Contract value"
        />
        <InfoBlock
          icon={<CheckCircle2 className="h-3.5 w-3.5 text-violet-600" />}
          label="Next Step"
          value={resolveNextStep(transaction)}
          sub="AI recommended"
        />
      </div>
    </div>
  )
}

function StageBadge({ stage }: { stage: Transaction['stage'] }) {
  const cls: Record<Transaction['stage'], string> = {
    offer: 'bg-blue-100 text-blue-700',
    inspection: 'bg-amber-100 text-amber-700',
    appraisal: 'bg-violet-100 text-violet-700',
    closing: 'bg-orange-100 text-orange-700',
    closed: 'bg-emerald-100 text-emerald-700',
  }

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${cls[stage]}`}>
      {stage}
    </span>
  )
}

function InfoBlock({
  icon,
  label,
  value,
  sub,
  danger,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  danger?: boolean
}) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <div className="mb-2 flex items-center gap-1.5">
        {icon}
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      </div>
      <p className={`line-clamp-2 text-xs font-semibold leading-relaxed ${danger ? 'text-red-700' : 'text-gray-800'}`}>
        {value}
      </p>
      <p className={`mt-1 text-xs ${danger ? 'font-semibold text-red-600' : 'text-gray-400'}`}>{sub}</p>
    </div>
  )
}

function resolveNextStep(transaction: Transaction) {
  if (transaction.stage === 'inspection') return 'Verify inspection response'
  if (transaction.stage === 'appraisal') return 'Confirm appraisal package'
  if (transaction.stage === 'closing') return 'Prep final walkthrough'
  if (transaction.stage === 'offer') return 'Review contract terms'
  return 'Archive closing file'
}
