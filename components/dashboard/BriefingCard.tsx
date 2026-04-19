'use client'

import Image from 'next/image'
import { Sparkles, Volume2, TrendingUp, Clock, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RecommendedAction } from '@/types/action'

interface BriefingCardProps {
  agentName: string
  actions: RecommendedAction[]
  onHearBriefing?: () => void
}

// ─── Briefing text generator ─────────────────────────────────────────────────

function generateBriefingText(actions: RecommendedAction[]): string {
  const critical = actions.filter((a) => a.urgency === 'critical').length
  const hotContacts = actions.filter(
    (a) => (a.type === 'call' || a.type === 'text' || a.type === 'email') && a.urgency !== 'low'
  ).length
  const listingsReady = actions.filter((a) => a.type === 'send_listing').length

  const parts: string[] = []
  if (critical > 0)
    parts.push(`${critical} critical deadline${critical > 1 ? 's' : ''} that can&apos;t wait`)
  if (hotContacts > 0)
    parts.push(`${hotContacts} high-priority lead${hotContacts > 1 ? 's' : ''} to contact now`)
  if (listingsReady > 0)
    parts.push(`${listingsReady} property match${listingsReady > 1 ? 'es' : ''} ready to send`)

  if (parts.length === 0) return 'Your pipeline is clean today. Focus on nurturing current leads.'
  if (parts.length === 1) return `You have ${parts[0]}.`
  const last = parts.pop()
  return `You have ${parts.join(', ')}, and ${last}.`
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BriefingCard({ agentName, actions, onHearBriefing }: BriefingCardProps) {
  const firstName = agentName.split(' ')[0]
  const topAction = actions[0] ?? null

  const hotContacts = actions.filter(
    (a) => (a.type === 'call' || a.type === 'text' || a.type === 'email') && a.urgency !== 'low'
  ).length
  const txDeadlines = actions.filter((a) => a.type === 'review_transaction').length
  const listingsReady = actions.filter((a) => a.type === 'send_listing').length

  const briefingText = generateBriefingText(actions)

  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#0A1020] via-[#0F1629] to-[#1a2f5e] p-6 mb-5 relative overflow-hidden">
      {/* Background glows */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(26,107,204,0.25),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(91,157,232,0.1),transparent_50%)]" />

      <div className="relative flex items-start justify-between gap-6">

        {/* Left: text content */}
        <div className="flex-1 min-w-0">
          {/* Label row */}
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-[#5b9de8]" />
            <span className="text-xs font-semibold text-[#5b9de8] uppercase tracking-widest">
              AI Daily Briefing
            </span>
            <span className="text-[10px] text-white/30 ml-1">· Updated just now</span>
          </div>

          {/* Headline */}
          <h1 className="text-white text-xl font-bold mb-3 leading-tight">
            Good morning, {firstName}.<br />
            <span className="text-[#5b9de8]">Here&apos;s what matters today.</span>
          </h1>

          {/* Dynamic briefing sentence */}
          <p className="text-white/70 text-sm leading-relaxed max-w-lg mb-3">
            <span dangerouslySetInnerHTML={{ __html: briefingText }} />{' '}
            {topAction && (
              <>
                Starting with{' '}
                <span className="text-white font-semibold">{topAction.title}</span> is your
                highest-impact first move.
              </>
            )}
          </p>

          {/* Stats chips */}
          <div className="flex gap-3 flex-wrap">
            {hotContacts > 0 && (
              <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-1.5 border border-white/10">
                <TrendingUp className="w-3 h-3 text-rose-400" />
                <span className="text-white/60 text-xs">Hot Leads</span>
                <span className="text-xs font-bold text-rose-400">{hotContacts}</span>
              </div>
            )}
            {txDeadlines > 0 && (
              <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-1.5 border border-white/10">
                <Clock className="w-3 h-3 text-amber-400" />
                <span className="text-white/60 text-xs">Tx Deadlines</span>
                <span className="text-xs font-bold text-amber-400">{txDeadlines}</span>
              </div>
            )}
            {listingsReady > 0 && (
              <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-1.5 border border-white/10">
                <RotateCcw className="w-3 h-3 text-emerald-400" />
                <span className="text-white/60 text-xs">Listings Ready</span>
                <span className="text-xs font-bold text-emerald-400">{listingsReady}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: mascot + voice button */}
        <div className="flex flex-col items-center gap-3 shrink-0">
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-[#1a6bcc]/30 blur-xl" />
            <Image
              src="/robo.png"
              alt="Lofty AI Copilot"
              width={90}
              height={90}
              className="relative rounded-2xl"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="bg-white/10 border-white/20 text-white hover:bg-white/20 text-xs gap-1.5 w-full"
            onClick={onHearBriefing}
          >
            <Volume2 className="w-3 h-3" />
            Hear Briefing
          </Button>
        </div>
      </div>
    </div>
  )
}
