import GlobalNav from '@/components/layout/GlobalNav'
import Sidebar from '@/components/layout/Sidebar'
import TopHeader from '@/components/layout/TopHeader'
import { agentProfile } from '@/lib/mock-data'

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#F8FAFC]">
      <GlobalNav />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopHeader agentName={agentProfile.name} />
          <div className="flex min-h-0 flex-1">{children}</div>
        </div>
      </div>
    </div>
  )
}
