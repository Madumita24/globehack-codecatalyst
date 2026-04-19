import { NextRequest, NextResponse } from 'next/server'
import { exchangeGoogleCodeForTokens } from '@/lib/gmail/client'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')

  if (error) {
    return renderTokenPage(`Google OAuth failed: ${escapeHtml(error)}`)
  }

  if (!code) {
    return renderTokenPage('Missing Google OAuth code.')
  }

  try {
    const tokens = await exchangeGoogleCodeForTokens(code)
    return renderTokenPage(
      [
        '<h1>Google Gmail connected</h1>',
        '<p>Add this value to <code>.env.local</code> and restart the dev server:</p>',
        `<pre>GOOGLE_REFRESH_TOKEN=${escapeHtml(tokens.refresh_token ?? '(no refresh token returned)')}</pre>`,
        '<p>If no refresh token was returned, visit <code>/api/google/auth</code> again after removing the app access from your Google account.</p>',
      ].join(''),
      true,
    )
  } catch (error) {
    return renderTokenPage(
      `Google token exchange failed: ${escapeHtml(error instanceof Error ? error.message : 'Unknown error')}`,
    )
  }
}

function renderTokenPage(content: string, isHtml = false) {
  return new NextResponse(
    `<!doctype html>
<html>
  <head>
    <title>Lofty Gmail OAuth</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 48px; color: #111827; }
      pre { background: #f3f4f6; padding: 16px; border-radius: 8px; overflow: auto; }
      code { background: #f3f4f6; padding: 2px 4px; border-radius: 4px; }
    </style>
  </head>
  <body>${isHtml ? content : `<p>${content}</p>`}</body>
</html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    },
  )
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
