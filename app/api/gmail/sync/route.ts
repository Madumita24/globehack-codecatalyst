import { NextResponse } from 'next/server'
import { syncGmailReplies } from '@/lib/gmail/reply-sync'

export async function POST() {
  try {
    const result = await syncGmailReplies()
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[GmailSync]', error)
    return NextResponse.json(
      {
        ok: false,
        skipped: false,
        reason: null,
        error: error instanceof Error ? error.message : 'Gmail sync failed.',
      },
      { status: 500 },
    )
  }
}
