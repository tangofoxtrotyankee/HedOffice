import type { EventStore } from "@hedoffice/event-store";
import type {
  CubicleDetailView,
  CubicleView,
  FeedLineView,
  PresenceStatus,
  TaskView,
} from "@hedoffice/schema";

/**
 * Builds the UI read-models (views) from the event log + projection tables. This
 * is the bridge from the source of truth to what the floor renders — the
 * "live data" path. Presence is derived from the latest `presence.changed`
 * event (event-sourced), so the views need only the store, not a live engine.
 */

interface AgentRow {
  agentId: string;
  name: string;
}
interface TaskRow {
  id: string;
  title: string;
  status: string;
}

function latestStatus(store: EventStore, agentId: string): PresenceStatus {
  const changes = store.read({ agentId, type: "presence.changed" });
  const last = changes.at(-1);
  return last && last.type === "presence.changed" ? last.payload.to : "offline";
}

function latestActivity(store: EventStore, agentId: string): { text: string; ts: number } {
  const events = store.read({ agentId });
  const last = events.at(-1);
  if (!last) return { text: "", ts: 0 };
  let text = "";
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.type === "tool.called") { text = e.payload.tool; break; }
    if (e.type === "channel.user_spoke") { text = `heard: ${e.payload.transcript}`; break; }
    if (e.type === "channel.agent_said") { text = `said: ${e.payload.text}`; break; }
  }
  return { text, ts: last.ts };
}

function tasksOf(store: EventStore, agentId: string): TaskRow[] {
  return store.db
    .prepare(`SELECT id, title, status FROM tasks WHERE agent_id = ? ORDER BY updated_at ASC`)
    .all(agentId) as TaskRow[];
}

/** The floor: one view per registered agent, derived from the live event log. */
export function buildFloorView(store: EventStore): CubicleView[] {
  const agents = store.db
    .prepare(`SELECT agent_id AS agentId, name FROM agents ORDER BY created_at ASC`)
    .all() as AgentRow[];
  return agents.map((a) => {
    const tasks = tasksOf(store, a.agentId);
    const activity = latestActivity(store, a.agentId);
    return {
      agentId: a.agentId,
      name: a.name,
      status: latestStatus(store, a.agentId),
      activity: activity.text,
      tasksDone: tasks.filter((t) => t.status === "done").length,
      tasksTotal: tasks.length,
      lastActivity: activity.ts,
    };
  });
}

/** The expanded-cubicle detail: notebook, tasks, and recent activity. */
export function buildCubicleDetail(
  store: EventStore,
  agentId: string,
  recentLimit = 12,
): CubicleDetailView {
  const nb = store.db
    .prepare(`SELECT content FROM notebooks WHERE agent_id = ?`)
    .get(agentId) as { content: string } | undefined;
  const tasks: TaskView[] = tasksOf(store, agentId).map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status as TaskView["status"],
  }));
  const recent: FeedLineView[] = store
    .read({ agentId })
    .filter((e) =>
      e.type === "tool.called" ||
      e.type === "channel.user_spoke" ||
      e.type === "channel.agent_said",
    )
    .slice(-recentLimit)
    .map((e) => {
      if (e.type === "tool.called") return { ts: e.ts, kind: "run", detail: e.payload.tool };
      if (e.type === "channel.user_spoke") return { ts: e.ts, kind: "say", detail: `🎙 ${e.payload.transcript}` };
      return { ts: e.ts, kind: "say", detail: `» ${(e as { payload: { text: string } }).payload.text}` };
    });
  return { agentId, notebook: nb?.content ?? "", tasks, recent };
}
