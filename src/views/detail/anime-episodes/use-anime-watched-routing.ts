import { useMemo } from "react";
import type { Meta } from "@/lib/cinemeta";
import type { FranchiseEntry } from "@/lib/providers/anime-detail";
import type { KitsuEpisode } from "@/lib/providers/kitsu";
import {
  recordManualWatchedMeta,
  setManualWatchedMany,
  type ManualWatchedMeta,
} from "@/lib/manual-watched";
import { syncAnimeProgress } from "@/lib/anilist/sync";
import { syncMalProgress } from "@/lib/mal/sync";
import { useSettings } from "@/lib/settings";
import { useSimkl } from "@/lib/simkl/provider";
import { stremioIdToSimklTarget } from "@/lib/simkl/ids";
import { markEpisodesWatched, unmarkEpisodesWatched } from "@/lib/simkl/history";
import { airedOnly } from "../helpers";
import { animeEpisodeCoordinates, animeEpisodeOwner } from "@/lib/anime-episode-identity";

const ANIME_TRACK_ID = /^(kitsu|mal|anilist|anidb):/;

export function useAnimeWatchedRouting(meta: Meta, franchise: FranchiseEntry[], trackId?: string, imdbId?: string | null) {
  const { settings } = useSettings();
  const { isConnected: simklConnected } = useSimkl();
  const byId = useMemo(() => {
    const m = new Map<string, Meta>();
    for (const f of franchise) m.set(f.meta.id, f.meta);
    return m;
  }, [franchise]);

  const metaForEp = (ep: KitsuEpisode): Meta => {
    const id = animeEpisodeCoordinates(ep, meta.id, trackId, imdbId)[0]?.id ?? animeEpisodeOwner(ep, meta.id, trackId);
    if (id === meta.id) return meta;
    return byId.get(id) ?? { ...meta, id };
  };

  const manualMetaFor = (metaId: string): ManualWatchedMeta => {
    const m = metaId === meta.id ? meta : (byId.get(metaId) ?? meta);
    return { type: "series", name: m.name, poster: m.poster, background: m.background };
  };

  const markMany = (displayEpisodes: KitsuEpisode[], watched: boolean) => {
    const eligible = watched ? airedOnly(displayEpisodes, (ep) => ep.airdate) : displayEpisodes;
    if (eligible.length === 0) return;
    const groups = new Map<string, Array<{ season: number; episode: number }>>();
    for (const ep of eligible) {
      const target = animeEpisodeCoordinates(ep, meta.id, trackId, imdbId)[0];
      if (!target) continue;
      const { id, season, episode } = target;
      const list = groups.get(id) ?? [];
      list.push({
        season,
        episode,
      });
      groups.set(id, list);
    }
    for (const [id, eps] of groups) {
      if (watched) recordManualWatchedMeta(id, manualMetaFor(id));
      setManualWatchedMany(id, eps, watched);
      if (simklConnected) {
        const target = stremioIdToSimklTarget(id, eps[0]);
        const ids = target.ok ? (target.target.kind === "anime-episode" ? target.target.anime.ids :
          target.target.kind === "episode" ? target.target.show.ids : null) : null;
        if (ids) for (const season of new Set(eps.map((ep) => ep.season))) {
          const numbers = eps.filter((ep) => ep.season === season).map((ep) => ep.episode);
          if (watched) void markEpisodesWatched(ids, season, numbers);
          else void unmarkEpisodesWatched(ids, season, numbers);
        }
      }
      if (watched && ANIME_TRACK_ID.test(id)) {
        const highest = Math.max(...eps.map((e) => e.episode));
        if (Number.isFinite(highest) && highest > 0) {
          const title = manualMetaFor(id).name;
          if (settings.anilistAutoSync) void syncAnimeProgress(id, highest, title);
          if (settings.malAutoSync) void syncMalProgress(id, highest, title);
        }
      }
    }
  };

  return { metaForEp, manualMetaFor, markMany };
}
