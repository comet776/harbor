import { useMemo } from "react";
import { useMal } from "@/lib/mal/provider";
import { fetchListEntry, resolveMalMediaId } from "@/lib/mal/mutations";
import { subscribeSync } from "./sync";
import { getSession } from "./session";
import type { KitsuEpisode } from "@/lib/providers/kitsu";
import { createAnimeEntryLoader, useAnimeTrackerWatched } from "@/lib/use-anime-tracker-watched";

export type MalWatched = { watchedKeys: Set<string>; completed: boolean };
const EMPTY = new Set<string>();
const loader = createAnimeEntryLoader(async (id) => {
  const owner = getSession();
  const mediaId = await resolveMalMediaId(id);
  if (mediaId == null || getSession() !== owner) return null;
  const info = await fetchListEntry(mediaId);
  return getSession() === owner ? {
    progress: info.entry?.numEpisodesWatched ?? 0, total: info.numEpisodes, completed: info.entry?.status === "completed",
  } : null;
});
const subscribe = (fn: () => void) => subscribeSync((event) => {
  if (event.kind === "ok" || event.kind === "watching") fn();
});

export function useMalWatchedEntries(groups: Map<string, KitsuEpisode[]>) {
  const { isConnected, session } = useMal();
  return useAnimeTrackerWatched(groups, session, isConnected, loader, subscribe);
}

export function useMalWatched(harborId: string, episodes: KitsuEpisode[]): MalWatched {
  const groups = useMemo(() => harborId ? new Map([[harborId, episodes]]) : new Map(), [harborId, episodes]);
  const result = useMalWatchedEntries(groups);
  return { watchedKeys: result.watched.get(harborId) ?? EMPTY, completed: result.completed.has(harborId) };
}
