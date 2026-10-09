import { useEffect, useMemo, useState } from "react";
import { activeProfileId } from "@/lib/active-profile-id";
import { useProfiles } from "@/lib/profiles";
import { airedOnly } from "@/lib/aired";
import { animeSeasonKey } from "@/lib/anime-episode-identity";
import type { KitsuEpisode } from "@/lib/providers/kitsu";

export type AnimeEntryProgress = { progress: number; total: number | null; completed: boolean };
export type AnimeWatchedEntries = { watched: Map<string, Set<string>>; completed: Set<string> };
const EMPTY: AnimeWatchedEntries = { watched: new Map(), completed: new Set() };

export function createAnimeEntryLoader(load: (id: string) => Promise<AnimeEntryProgress | null>) {
  let owner: unknown;
  let profile = "";
  const cache = new Map<string, { at: number; value: Promise<AnimeEntryProgress | null> }>();
  return {
    invalidate() { cache.clear(); },
    load(id: string, session: unknown, profileId: string) {
      if (owner !== session || profile !== profileId) {
        cache.clear(); owner = session; profile = profileId;
      }
      const hit = cache.get(id);
      if (hit && Date.now() - hit.at < 30_000) return hit.value;
      const value = load(id).catch(() => {
        if (cache.get(id)?.value === value) cache.delete(id);
        return null;
      });
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      cache.set(id, { at: Date.now(), value });
      return value;
    },
  };
}

export function projectAnimeEntryProgress(episodes: KitsuEpisode[], info: AnimeEntryProgress): Set<string> {
  const watched = new Set<string>();
  const sorted = [...episodes].sort((a, b) => animeSeasonKey(a) - animeSeasonKey(b) || a.number - b.number);
  for (const ep of airedOnly(sorted, (e) => e.airdate)) {
    // Progress is an entry-relative episode number, not an index in a possibly sparse list.
    if (ep.number < 1 || (info.total != null && info.total > 0 && ep.number > info.total)) continue;
    if (info.completed || ep.number <= info.progress) watched.add(`${animeSeasonKey(ep)}:${ep.number}`);
  }
  return watched;
}

export function useAnimeTrackerWatched(
  groups: Map<string, KitsuEpisode[]>,
  session: unknown,
  connected: boolean,
  loader: ReturnType<typeof createAnimeEntryLoader>,
  subscribe: (fn: () => void) => () => void,
): AnimeWatchedEntries {
  const { activeProfile } = useProfiles();
  const profileId = activeProfile?.id ?? activeProfileId();
  const [revision, setRevision] = useState(0);
  const signature = [...groups].map(([id, eps]) => `${id}:${eps.map((e) =>
    `${e.number}:${animeSeasonKey(e)}:${e.airdate ?? ""}`).join(",")}`).join("|");
  const requestKey = useMemo(() => ({}), [signature, profileId, session, connected, revision]);
  const [state, setState] = useState<{ key: object; result: AnimeWatchedEntries } | null>(null);
  useEffect(() => subscribe(() => {
    loader.invalidate();
    setRevision((r) => r + 1);
  }), [loader, subscribe]);
  useEffect(() => {
    if (!connected || groups.size === 0) return;
    let cancelled = false;
    const entries = [...groups];
    let index = 0;
    const result: AnimeWatchedEntries = { watched: new Map(), completed: new Set() };
    const worker = async () => {
      while (!cancelled && index < entries.length) {
        const [id, episodes] = entries[index++];
        const info = await loader.load(id, session, profileId);
        if (cancelled || activeProfileId() !== profileId) return;
        if (info) {
          result.watched.set(id, projectAnimeEntryProgress(episodes, info));
          if (info.completed) result.completed.add(id);
        }
        setState({ key: requestKey, result: {
          watched: new Map(result.watched), completed: new Set(result.completed),
        } });
      }
    };
    void Promise.all(Array.from({ length: Math.min(4, entries.length) }, worker));
    return () => { cancelled = true; };
  }, [requestKey, loader]);
  return connected && state?.key === requestKey ? state.result : EMPTY;
}
