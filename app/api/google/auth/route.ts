import { NextResponse } from 'next/server'
import { getGoogleAuthUrl } from '@/lib/gmail/client'

export async function GET() {
  try {
    return NextResponse.redirect(getGoogleAuthUrl())
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Google OAuth is not configured.',
      },
      { status: 500 },
    )
  }
}
