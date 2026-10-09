import { useMemo } from "react";
import type { EpisodeProgress } from "@/lib/episode-progress";
import { getAnimeEpisodeProgress, type AnimeProgressContext } from "@/lib/anime-progress";
import { animeEpisodeKey } from "@/lib/anime-episode-identity";
import type { KitsuEpisode } from "@/lib/providers/kitsu";
import { spoilerMaskFor, type SpoilerMask } from "@/lib/spoilers";
import { airedOnly } from "../helpers";

const NO_PROGRESS: EpisodeProgress = { ratio: 0, watched: false, startedAt: 0 };

export function useAnimeProgressMap({ episodes, displayEpisodes, progressContext, mwVersion, resumeVersion, settings }: {
  episodes: KitsuEpisode[];
  displayEpisodes: KitsuEpisode[];
  progressContext: AnimeProgressContext;
  mwVersion: number;
  resumeVersion: number;
  settings: Parameters<typeof spoilerMaskFor>[0];
}) {
  const keyFor = (ep: KitsuEpisode) => animeEpisodeKey(ep, progressContext.metaId, progressContext.trackId);
  const progressById = useMemo(() => {
    const map = new Map<string, EpisodeProgress>();
    // Display rows may carry richer provider mappings than the base list.
    for (const ep of [...episodes, ...displayEpisodes])
      map.set(animeEpisodeKey(ep, progressContext.metaId, progressContext.trackId), getAnimeEpisodeProgress(ep, progressContext));
    return map;
  }, [episodes, displayEpisodes, progressContext, mwVersion, resumeVersion]);
  const progressFor = (ep: KitsuEpisode) => progressById.get(keyFor(ep)) ?? NO_PROGRESS;
  const scan = displayEpisodes.length > 0 ? displayEpisodes : episodes;
  const nextUpEp = scan.find((ep) => !progressFor(ep).watched) ?? null;
  const nextUpId = nextUpEp?.id ?? null;
  const nextUpNum = nextUpEp?.number ?? null;
  const spoilerFor = (ep: KitsuEpisode): SpoilerMask => spoilerMaskFor(settings, {
    watched: progressFor(ep).watched,
    isNextUp: nextUpEp != null && keyFor(ep) === keyFor(nextUpEp),
  });
  const airedDisplay = airedOnly(displayEpisodes, (ep) => ep.airdate);
  const allWatched = airedDisplay.length > 0 && airedDisplay.every((ep) => progressFor(ep).watched);
  return { progressFor, nextUpNum, nextUpId, spoilerFor, allWatched };
}
