# Lofty AI Copilot

AI-powered real estate workflow copilot built during GlobeHack 2026.

Lofty AI Copilot is a CRM-style productivity platform for real estate agents that turns scattered lead activity into prioritized daily execution. Instead of making an agent dig through contacts, listings, calendars, and transactions, the app surfaces the highest-impact next actions, drafts outreach, and supports voice-first navigation through the workspace.

## Why This Project Matters

Real estate teams often lose momentum because the tools they use show raw data, not clear action. This project focuses on the operational question:

**What should the agent do next, and why?**

To answer that, the app combines:
- lead scoring and next-best-action ranking
- conversational AI assistance
- voice briefing and text-to-speech support
- action execution flows for email, text, and follow-up
- optional cloud-backed data integrations

## Core Features

- **AI-ranked daily dashboard** that highlights urgent tasks, lead opportunities, and transaction deadlines
- **Lead prioritization engine** that scores contacts using recency, intent signals, urgency, property fit, and deal risk
- **Conversational assistant** that understands natural-language requests and routes users to the right screen or workflow
- **Voice-enabled experience** with spoken daily briefings and assistant responses
- **Action execution flows** for outreach, including SMS prep and SES-based email delivery
- **CRM-style workspace** across dashboard, leads, tasks, calendar, and transactions
- **Mock-data-first architecture** with graceful fallback to DynamoDB-backed app data
- **Gmail sync hooks** for reply-aware workflow updates

## Product Walkthrough

### Dashboard
The dashboard is the command center for the agent's day. It surfaces:
- prioritized tasks
- recommended outreach actions
- transaction deadlines
- appointments
- summary KPIs

### Leads
The leads view gives a searchable, filterable list of contacts with scores, urgency, and quick actions such as call, text, and email.

### Transactions
The transactions view keeps active deals visible and emphasizes deadline pressure so important deals do not slip.

### Calendar
The calendar page consolidates agent appointments and supports the assistant's navigation context.

### AI Assistant
The assistant accepts natural-language prompts such as:
- "Show me my top lead"
- "Take me to urgent tasks"
- "Who should I contact first today?"
- "Draft a follow-up email"

It returns a structured decision that can:
- navigate to a route
- highlight a relevant section
- explain why an action matters
- prepare communication workflows

## How It Works

### 1. App data layer
The application loads leads, properties, events, and actions from DynamoDB when configured. If cloud data is unavailable, it falls back to a rich mock dataset so the experience still works end to end.

### 2. Scoring and recommendation engine
The recommendation engine generates ranked actions by combining:
- intent score
- urgency score
- property match score
- risk score

This turns passive CRM data into concrete recommended actions.

### 3. Structured AI assistant
The assistant endpoint builds a compact app context, sends it to an LLM, and expects a schema-constrained JSON decision. This makes assistant behavior easier to validate and safer to wire into product flows.

### 4. Communication layer
The product supports:
- email sending via AWS SES
- SMS handoff via device messaging apps
- text-to-speech via ElevenLabs with browser fallback

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 4, shadcn/ui |
| AI | OpenAI Responses API |
| Voice | ElevenLabs API, Web Speech API |
| Email | AWS SES v2 |
| Data | DynamoDB or mock data fallback |
| Deployment Target | Vercel-ready |

## Repository Structure

```text
app/
  dashboard/           Main agent dashboard
  people/              Leads and contact management
  transactions/        Deal and deadline tracking
  calendar/            Appointment views
  tasks/               Action/task planning
  api/
    assistant/         LLM routing and decision endpoint
    tts/               ElevenLabs text-to-speech proxy
    email/send/        Email delivery endpoint
    tasks/             Task and action data APIs

components/
  assistant/           Floating assistant widget and chat UI
  dashboard/           Dashboard cards and action dialogs
  layout/              App shell and navigation
  ui/                  Shared UI primitives

lib/
  ai/                  Assistant orchestration logic
  data/                DynamoDB + app-data assembly
  email/               SES integration
  gmail/               Gmail auth and reply sync helpers
  scoring.ts           Recommendation engine
  mock-data.ts         Demo dataset for standalone use

hooks/
  useVoice.ts          TTS playback
  useConfetti.ts       UI interaction polish

types/
  Shared domain types for leads, actions, properties, events, and assistant responses
```

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Create a `.env.local` file if you want to enable external integrations.

### Required for AI assistant

```bash
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4o-mini
```

### Optional for voice

```bash
ELEVENLABS_API_KEY=your_key_here
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
```

### Optional for AWS email + DynamoDB

```bash
AWS_REGION=us-east-1
SES_FROM_EMAIL=verified-sender@example.com
SES_REPLY_TO_EMAIL=reply@example.com
SES_CONFIGURATION_SET=optional-config-set

DDB_PEOPLE_TABLE=your_people_table
DDB_PROPERTIES_TABLE=your_properties_table
DDB_EVENTS_TABLE=your_events_table
DDB_ACTIONS_TABLE=your_actions_table
```

### Optional for Gmail sync

```bash
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
GOOGLE_REFRESH_TOKEN=your_google_refresh_token
```

## Demo Mode

The app is designed to work even without cloud credentials. If DynamoDB or external services are not configured, it falls back to mock data and still demonstrates the product experience.

That makes it useful for:
- hackathon demos
- portfolio review
- recruiter walkthroughs
- product design storytelling

## What Makes This Resume-Worthy

This is stronger than a simple chatbot demo because it shows:
- multi-screen product thinking
- AI integrated into business workflow, not isolated prompting
- structured decisioning instead of free-form model output
- real-world communication and operational features
- cloud integration points for production-style deployment

## Future Improvements

- production authentication and role-based access control
- persistent conversation memory and activity history
- live CRM integrations instead of mock/demo data
- evaluation suite for assistant decisions and action quality
- observability dashboards for assistant reliability and outreach outcomes
- richer analytics for conversion and lead engagement

## Notes

This repository reflects a GlobeHack prototype and product exploration. Some features are fully implemented, while others are integration-ready and designed for extension into a more production-grade system.
