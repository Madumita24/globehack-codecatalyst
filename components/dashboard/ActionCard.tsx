'use client'

import {
  Phone, MessageSquare, Mail, Send, Clock, ArrowRight,
  Sparkles, ChevronRight, CheckCircle2, Volume2, AlertTriangle, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RecommendedAction } from '@/types/action'
import type { Lead } from '@/types/lead'
import type { Property } from '@/types/property'

// ─── Config maps ──────────────────────────────────────────────────────────────

const ACTION_CONFIG: Record<
  RecommendedAction['type'],
  { icon: React.ElementType; color: string; bg: string; cta: string }
> = {
  call:                 { icon: Phone,         color: 'text-blue-600',    bg: 'bg-blue-50',    cta: 'Start Call'    },
  text:                 { icon: MessageSquare, color: 'text-violet-600',  bg: 'bg-violet-50',  cta: 'Send Text'     },
  email:                { icon: Mail,          color: 'text-emerald-600', bg: 'bg-emerald-50', cta: 'Send Email'    },
  send_listing:         { icon: Send,          color: 'text-[#1a6bcc]',   bg: 'bg-blue-50',    cta: 'Send Listing'  },
  review_transaction:   { icon: Clock,         color: 'text-orange-600',  bg: 'bg-orange-50',  cta: 'Review Now'    },
  schedule_followup:    { icon: ArrowRight,    color: 'text-gray-600',    bg: 'bg-gray-50',    cta: 'Schedule'      },
}

const URGENCY_CONFIG: Record<
  RecommendedAction['urgency'],
  { label: string; badge: string; borderColor: string; rankBg: string }
> = {
  critical: { label: 'Critical', badge: 'bg-red-600 text-white',        borderColor: 'border-l-red-500',    rankBg: 'bg-red-500 text-white'      },
  high:     { label: 'High',     badge: 'bg-rose-100 text-rose-700',    borderColor: 'border-l-[#1a6bcc]',  rankBg: 'bg-[#1a6bcc] text-white'    },
  medium:   { label: 'Medium',   badge: 'bg-amber-100 text-amber-700',  borderColor: 'border-l-amber-400',  rankBg: 'bg-amber-400 text-white'    },
  low:      { label: 'Low',      badge: 'bg-gray-100 text-gray-500',    borderColor: 'border-l-gray-200',   rankBg: 'bg-gray-200 text-gray-600'  },
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ActionCardProps {
  action: RecommendedAction
  rank: number
  lead?: Lead | null
  property?: Property | null
  isSelected?: boolean
  isDone?: boolean
  isSpeaking?: boolean
  isVoiceLoading?: boolean
  onWhyThis: (action: RecommendedAction) => void
  onExecute: (action: RecommendedAction) => void
  onSnooze?: (action: RecommendedAction) => void
  onHearAction?: (action: RecommendedAction) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ActionCard({
  action,
  rank,
  lead,
  property,
  isSelected = false,
  isDone = false,
  isSpeaking = false,
  isVoiceLoading = false,
  onWhyThis,
  onExecute,
  onSnooze,
  onHearAction,
}: ActionCardProps) {
  const cfg = ACTION_CONFIG[action.type]
  const urg = URGENCY_CONFIG[action.urgency]
  const Icon = cfg.icon
  const confidence = Math.round(action.confidence)

  return (
    <div
      className={[
        'bg-white rounded-xl border-l-4 border border-gray-100 shadow-sm transition-all duration-150',
        urg.borderColor,
        isSelected ? 'ring-2 ring-[#1a6bcc]/20 border-[#1a6bcc]/30' : 'hover:shadow-md hover:border-gray-200',
        isDone ? 'opacity-40 pointer-events-none' : '',
      ].join(' ')}
    >
      <div className="p-4">

        {/* ── Header row ──────────────────────────────────────────────────── */}
        <div className="flex items-start gap-3">

          {/* Rank circle */}
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5 ${urg.rankBg}`}>
            {rank}
          </div>

          {/* Action type icon */}
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg}`}>
            <Icon className={`w-4 h-4 ${cfg.color}`} />
          </div>

          {/* Title + summary */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="text-sm font-semibold text-gray-900">{action.title}</span>
              {isDone && (
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  Done
                </span>
              )}
              {lead && (
                <span className="text-xs text-gray-400">· Score {lead.score}</span>
              )}
              {property && (
                <span className="text-xs text-gray-400">· {property.city}</span>
              )}
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{action.summary}</p>
          </div>

          {/* Urgency badge + confidence bar */}
          <div className="flex flex-col items-end gap-1.5 shrink-0 ml-1">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${urg.badge}`}>
              {urg.label}
            </span>
            <div className="flex items-center gap-1.5">
              <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#1a6bcc] rounded-full transition-all"
                  style={{ width: `${confidence}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-400">{confidence}%</span>
            </div>
          </div>
        </div>

        {/* ── Reason bullets (first 2) ─────────────────────────────────────── */}
        {action.reasons.length > 0 && (
          <div className="mt-2.5 pl-[68px] space-y-1">
            {action.reasons.slice(0, 2).map((r, i) => (
              <p key={i} className="text-xs text-gray-500 flex items-start gap-1.5 leading-relaxed">
                <span className="text-[#1a6bcc] mt-0.5 shrink-0">·</span>
                {r}
              </p>
            ))}
          </div>
        )}

        {/* ── Draft message preview ────────────────────────────────────────── */}
        {action.draftMessage && (
          <div className="mt-2 ml-[68px] p-2.5 bg-gray-50 rounded-lg border border-gray-100">
            <p className="text-[11px] text-gray-500 italic line-clamp-2">
              &ldquo;{action.draftMessage}&rdquo;
            </p>
          </div>
        )}

        {/* ── If-ignored warning (shown when critical) ─────────────────────── */}
        {action.consequenceIfIgnored && action.urgency === 'critical' && (
          <div className="mt-2 ml-[68px] flex items-start gap-1.5">
            <AlertTriangle className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-600 leading-relaxed">{action.consequenceIfIgnored}</p>
          </div>
        )}

        {/* ── CTA row ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mt-3 pl-[68px]">
          <Button
            size="sm"
            className="h-7 text-xs bg-[#1a6bcc] hover:bg-[#1558a8] text-white border-0 gap-1"
            onClick={() => onExecute(action)}
          >
            <CheckCircle2 className="w-3 h-3" />
            {isDone ? 'Completed' : cfg.cta}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className={`h-7 text-xs gap-1 ${isSelected ? 'border-[#1a6bcc] text-[#1a6bcc]' : ''}`}
            onClick={() => onWhyThis(action)}
          >
            <Sparkles className="w-3 h-3 text-[#1a6bcc]" />
            Why this?
            <ChevronRight className={`w-3 h-3 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
          </Button>

          {onSnooze && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-gray-400 hover:text-gray-600"
              onClick={() => onSnooze(action)}
            >
              Snooze
            </Button>
          )}

          {onHearAction && (
            <button
              className="ml-auto p-1 rounded-lg hover:bg-gray-100 transition-colors"
              title={isSpeaking ? 'Stop' : 'Explain aloud'}
              onClick={() => onHearAction(action)}
            >
              {isVoiceLoading ? (
                <Loader2 className="w-3.5 h-3.5 text-[#1a6bcc] animate-spin" />
              ) : isSpeaking ? (
                <Volume2 className="w-3.5 h-3.5 text-[#1a6bcc] animate-pulse" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-gray-300 hover:text-gray-500" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
