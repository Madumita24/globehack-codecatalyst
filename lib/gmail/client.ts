import 'server-only'

export type GmailMessage = {
  id: string
  threadId: string
  from: string
  fromEmail: string
  subject: string
  date: string
  internalDate: string
  snippet: string
  body: string
}

type GmailListResponse = {
  messages?: Array<{ id: string; threadId: string }>
}

type GmailMessageResponse = {
  id: string
  threadId: string
  internalDate?: string
  snippet?: string
  payload?: GmailPayload
}

type GmailPayload = {
  mimeType?: string
  filename?: string
  headers?: Array<{ name: string; value: string }>
  body?: {
    data?: string
  }
  parts?: GmailPayload[]
}

type GoogleTokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  error?: string
  error_description?: string
}

export function isGmailConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_REDIRECT_URI?.trim() &&
      process.env.GOOGLE_REFRESH_TOKEN?.trim(),
  )
}

export function getGoogleAuthUrl() {
  const clientId = requiredEnv('GOOGLE_CLIENT_ID')
  const redirectUri = requiredEnv('GOOGLE_REDIRECT_URI')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeGoogleCodeForTokens(code: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: requiredEnv('GOOGLE_CLIENT_ID'),
      client_secret: requiredEnv('GOOGLE_CLIENT_SECRET'),
      redirect_uri: requiredEnv('GOOGLE_REDIRECT_URI'),
      grant_type: 'authorization_code',
    }),
  })

  const data = (await response.json()) as GoogleTokenResponse
  if (!response.ok || data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Google token exchange failed.')
  }

  return data
}

export async function getGmailAccessToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: requiredEnv('GOOGLE_CLIENT_ID'),
      client_secret: requiredEnv('GOOGLE_CLIENT_SECRET'),
      refresh_token: requiredEnv('GOOGLE_REFRESH_TOKEN'),
      grant_type: 'refresh_token',
    }),
  })

  const data = (await response.json()) as GoogleTokenResponse
  if (!response.ok || data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Google refresh token failed.')
  }

  return data.access_token
}

export async function fetchRecentGmailMessages(options?: {
  maxResults?: number
  newerThanDays?: number
}) {
  const accessToken = await getGmailAccessToken()
  const newerThanDays = options?.newerThanDays ?? 7
  const maxResults = options?.maxResults ?? 10
  const listParams = new URLSearchParams({
    q: `newer_than:${newerThanDays}d -from:me`,
    maxResults: String(maxResults),
  })

  const listResponse = await gmailFetch<GmailListResponse>(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${listParams.toString()}`,
    accessToken,
  )

  const messages = listResponse.messages ?? []
  const detailed = await Promise.all(
    messages.map((message) => fetchGmailMessage(accessToken, message.id)),
  )

  return detailed.filter((message): message is GmailMessage => Boolean(message))
}

async function fetchGmailMessage(accessToken: string, id: string): Promise<GmailMessage | null> {
  const params = new URLSearchParams({
    format: 'full',
  })
  const raw = await gmailFetch<GmailMessageResponse>(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?${params.toString()}`,
    accessToken,
  )
  const headers = raw.payload?.headers ?? []
  const from = headerValue(headers, 'From')
  const subject = headerValue(headers, 'Subject') || '(no subject)'
  const date = headerValue(headers, 'Date')
  const body = extractBody(raw.payload)

  if (!from || !body.trim()) return null

  return {
    id: raw.id,
    threadId: raw.threadId,
    from,
    fromEmail: extractEmailAddress(from),
    subject,
    date,
    internalDate: raw.internalDate ?? '',
    snippet: raw.snippet ?? '',
    body: cleanReplyBody(body),
  }
}

async function gmailFetch<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  const text = await response.text()
  const data = (text ? JSON.parse(text) : {}) as T & { error?: { message?: string } }
  if (!response.ok) {
    throw new Error(data.error?.message || 'Gmail request failed.')
  }

  return data as T
}

function extractBody(payload?: GmailPayload): string {
  if (!payload) return ''

  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data)
  }

  const plainPart = findPart(payload, 'text/plain')
  if (plainPart?.body?.data) return decodeBase64Url(plainPart.body.data)

  const htmlPart = findPart(payload, 'text/html')
  if (htmlPart?.body?.data) return stripHtml(decodeBase64Url(htmlPart.body.data))

  return payload.parts?.map(extractBody).find(Boolean) ?? ''
}

function findPart(payload: GmailPayload, mimeType: string): GmailPayload | null {
  if (payload.mimeType === mimeType) return payload
  for (const part of payload.parts ?? []) {
    const match = findPart(part, mimeType)
    if (match) return match
  }
  return null
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  return Buffer.from(padded, 'base64').toString('utf8')
}

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function cleanReplyBody(value: string) {
  return value
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('>'))
    .join('\n')
    .split(/\nOn .+ wrote:\s*$/i)[0]
    .split(/\nFrom:\s*.+$/i)[0]
    .trim()
}

function headerValue(headers: Array<{ name: string; value: string }>, name: string) {
  return headers.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function extractEmailAddress(value: string) {
  const match = value.match(/<([^>]+)>/)
  return (match?.[1] ?? value).trim().toLowerCase()
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}
