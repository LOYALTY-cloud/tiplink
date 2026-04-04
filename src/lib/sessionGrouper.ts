type Event = {
  id: string
  action: string
  created_at: string
  [key: string]: unknown
}

export type Session = {
  events: Event[]
  start: string
  end: string
  suspicious: boolean
}

const SESSION_GAP_MS = 5 * 60 * 1000 // 5 minutes

export function groupSessions(events: Event[]): Session[] {
  if (!events.length) return []

  // Sort ascending by time
  const sorted = [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  const sessions: Session[] = []
  let current: Event[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const prevTime = new Date(sorted[i - 1].created_at).getTime()
    const currTime = new Date(sorted[i].created_at).getTime()

    if (currTime - prevTime <= SESSION_GAP_MS) {
      current.push(sorted[i])
    } else {
      sessions.push(buildSession(current))
      current = [sorted[i]]
    }
  }

  sessions.push(buildSession(current))
  return sessions
}

function buildSession(events: Event[]): Session {
  return {
    events,
    start: events[0].created_at,
    end: events[events.length - 1].created_at,
    suspicious: events.length >= 3,
  }
}
