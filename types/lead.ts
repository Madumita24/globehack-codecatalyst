export type LeadStage = 'new' | 'nurturing' | 'hot' | 'active' | 'cold'

export type EngagementLevel = 'high' | 'medium' | 'low' | 'none'

export type Lead = {
  id: string
  name: string
  email: string
  phone: string
  stage: LeadStage
  score: number
  budget: number
  preferredAreas: string[]
  preferences: {
    minBeds: number
    maxBeds: number
    minBaths: number
    propertyTypes: string[]
  }
  lastContactDaysAgo: number
  recentBehavior: string[]
  intentSignals: string[]
  assignedAgent: string
  source: string
  engagementLevel?: EngagementLevel
  avatar?: string
}
