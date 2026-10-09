import { useMemo } from "react";
import { useAnilist } from "@/lib/anilist/provider";
import { fetchListEntry } from "@/lib/anilist/mutations";
import { resolveAnilistMediaId, subscribeSync } from "@/lib/anilist/sync";
import { getSession } from "./session";
import type { KitsuEpisode } from "@/lib/providers/kitsu";
import { createAnimeEntryLoader, useAnimeTrackerWatched } from "@/lib/use-anime-tracker-watched";

export type AnilistWatched = { watchedKeys: Set<string>; completed: boolean };
const EMPTY = new Set<string>();
const loader = createAnimeEntryLoader(async (id) => {
  const owner = getSession();
  const mediaId = await resolveAnilistMediaId(id);
  if (mediaId == null || getSession() !== owner) return null;
  const info = await fetchListEntry(mediaId);
  return getSession() === owner ? {
    progress: info.entry?.progress ?? 0, total: info.episodes, completed: info.entry?.status === "COMPLETED",
  } : null;
});
const subscribe = (fn: () => void) => subscribeSync((event) => {
  if (event.kind === "ok" || event.kind === "watching") fn();
});

export function useAnilistWatchedEntries(groups: Map<string, KitsuEpisode[]>) {
  const { isConnected, session } = useAnilist();
  return useAnimeTrackerWatched(groups, session, isConnected, loader, subscribe);
}

export function useAnilistWatched(harborId: string, episodes: KitsuEpisode[]): AnilistWatched {
  const groups = useMemo(() => harborId ? new Map([[harborId, episodes]]) : new Map(), [harborId, episodes]);
  const result = useAnilistWatchedEntries(groups);
  return { watchedKeys: result.watched.get(harborId) ?? EMPTY, completed: result.completed.has(harborId) };
}
