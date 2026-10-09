import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSimkl } from "./provider";
import { getSession } from "./session";
import { loadSimklWatchedMap, simklProgressVersion, subscribeSimklProgress } from "./list-status";
import { activeProfileId } from "@/lib/active-profile-id";
import { useProfiles } from "@/lib/profiles";
import { ANIME_ENTRY_ID } from "@/lib/anime-episode-identity";

const EMPTY = new Map<string, Set<string>>();

export function useSimklWatchedMap(entryAliases: Map<string, string[]>): Map<string, Set<string>> {
  const { isConnected, session } = useSimkl();
  const { activeProfile } = useProfiles();
  const profileId = activeProfile?.id ?? activeProfileId();
  const revision = useSyncExternalStore(subscribeSimklProgress, simklProgressVersion);
  const signature = [...entryAliases].map(([id, aliases]) => `${id}:${aliases.join(",")}`).join("|");
  const key = useMemo(() => ({}), [session, profileId, isConnected, revision, signature]);
  const [state, setState] = useState<{ key: object; map: Map<string, Set<string>> } | null>(null);
  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const owned = () => !cancelled && profileId === activeProfileId() && session === getSession();
    void (async () => {
      const map = new Map(await loadSimklWatchedMap());
      if (!owned()) return;
      // Only native aliases share entry-relative coordinates. Provider IDs stay mapped separately.
      for (const [id, aliases] of entryAliases) {
        const watched = new Set(map.get(id));
        for (const alias of aliases)
          if (ANIME_ENTRY_ID.test(alias)) for (const ep of map.get(alias) ?? []) watched.add(ep);
        if (watched.size) map.set(id, watched);
      }
      if (owned()) setState({ key, map });
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [key]);
  return isConnected && state?.key === key ? state.map : EMPTY;
}
