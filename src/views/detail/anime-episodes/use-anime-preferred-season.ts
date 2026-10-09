import { useMemo } from "react";
import { getAnimeEpisodeProgress, type AnimeProgressContext } from "@/lib/anime-progress";
import type { KitsuEpisode } from "@/lib/providers/kitsu";
import { parseKitsuId } from "@/lib/providers/kitsu";
import { splitFranchiseDisplaySeason } from "@/lib/streams/anime-identity-core";

export function useAnimePreferredSeason({ episodes, progressContext, mwVersion, resumeVersion }: {
  episodes: KitsuEpisode[];
  progressContext: AnimeProgressContext;
  mwVersion: number;
  resumeVersion: number;
}): string | null {
  return useMemo(() => {
    if (episodes.length === 0) return null;
    const { metaId, trackId } = progressContext;
    const partScoped = splitFranchiseDisplaySeason(parseKitsuId(metaId)) != null ||
      (trackId ? splitFranchiseDisplaySeason(parseKitsuId(trackId)) != null : false);
    const seasonFor = (ep: KitsuEpisode) => partScoped
      ? (ep.seasonNumber ?? ep.imdbSeason ?? 1) : (ep.imdbSeason ?? ep.seasonNumber ?? 1);
    const progress = episodes.map((ep) => getAnimeEpisodeProgress(ep, progressContext));
    let playedSeason: number | null = null;
    let latest = 0;
    let maxCurrentSeason = 1;
    for (let i = 0; i < episodes.length; i++) {
      const ep = episodes[i];
      if (progress[i].startedAt > latest && progress[i].ratio > 0) {
        latest = progress[i].startedAt;
        playedSeason = seasonFor(ep);
      }
      if (ep.sourceMetaId == null) maxCurrentSeason = Math.max(maxCurrentSeason, seasonFor(ep));
    }
    let maxSeason = 1;
    for (let i = 0; i < episodes.length; i++) {
      const ep = episodes[i];
      const season = seasonFor(ep);
      if (season < 1) continue;
      if (ep.sourceMetaId != null && ep.sourceMetaId !== trackId && ep.sourceMetaId !== metaId) {
        if (splitFranchiseDisplaySeason(parseKitsuId(ep.sourceMetaId)) != null) continue;
        if (season <= maxCurrentSeason) continue;
      }
      maxSeason = Math.max(maxSeason, season);
      if (!progress[i].watched && (playedSeason == null || season >= playedSeason)) return String(season);
    }
    return String(playedSeason != null && playedSeason > 0 ? playedSeason : maxSeason);
  }, [episodes, progressContext, mwVersion, resumeVersion]);
}
