import type { KitsuEpisode } from "@/lib/providers/kitsu";
import type { PlayEpisode } from "@/lib/view";

export type EpisodeCoordinate = { id: string; season: number; episode: number };
export const ANIME_ENTRY_ID = /^(kitsu|mal|anilist|anidb):\d+$/;

export function animeSeasonKey(ep: KitsuEpisode): number {
  if (ep.imdbSeason === 0) return 0;
  return ep.id < 0 ? (ep.imdbSeason ?? ep.seasonNumber ?? 1) : (ep.seasonNumber ?? 1);
}

export function animeEpisodeOwner(ep: KitsuEpisode, metaId: string, trackId?: string): string {
  return ep.sourceMetaId ?? ep.streamId?.match(/^(kitsu:[^:]+):\d+$/)?.[1] ?? trackId ?? metaId;
}

export function animeEpisodeKey(ep: KitsuEpisode, metaId: string, trackId?: string): string {
  return `${animeEpisodeOwner(ep, metaId, trackId)}|${animeSeasonKey(ep)}:${ep.number}`;
}

/** Native entry and provider coordinates are aliases only with an explicit episode mapping. */
export function animeEpisodeCoordinates(
  ep: KitsuEpisode,
  metaId: string,
  trackId?: string,
  imdbId?: string | null,
): EpisodeCoordinate[] {
  const owner = animeEpisodeOwner(ep, metaId, trackId);
  const stream = ep.streamId?.match(/^(kitsu:\d+):(\d+)$/);
  const nativeEpisode = stream && stream[1] === owner ? Number(stream[2]) : ep.number;
  const nativeSeason = ep.id < 0 && stream ? (ep.imdbSeason === 0 ? 0 : 1) : animeSeasonKey(ep);
  const targets: EpisodeCoordinate[] = [];
  const add = (id: string, season: number, episode: number) => {
    if (!targets.some((t) => t.id === id && t.season === season && t.episode === episode))
      targets.push({ id, season, episode });
  };
  const bound = ep.id >= 0 || ep.sourceMetaId != null || stream != null;
  if (bound && ANIME_ENTRY_ID.test(owner)) add(owner, nativeSeason, nativeEpisode);
  else if (!ANIME_ENTRY_ID.test(owner) && (ep.imdbSeason == null || ep.imdbEpisode == null))
    add(owner, nativeSeason, nativeEpisode);
  const current = owner === trackId || owner === metaId;
  if (bound && owner === metaId && ANIME_ENTRY_ID.test(metaId)) add(metaId, nativeSeason, nativeEpisode);
  if (bound && current && trackId && ANIME_ENTRY_ID.test(trackId)) add(trackId, nativeSeason, nativeEpisode);
  if (ep.imdbSeason != null && ep.imdbEpisode != null) {
    for (const id of [metaId, ep.imdbId, imdbId]) {
      if (id && (id.startsWith("tt") || id.startsWith("tmdb:tv:")))
        add(id, ep.imdbSeason, ep.imdbEpisode);
    }
  }
  return targets;
}

/** Playback must persist the same entry/coordinates that episode rows read. */
export function animePlaybackCoordinates(
  metaId: string,
  ep: PlayEpisode | undefined,
  season?: number,
  episode?: number,
): EpisodeCoordinate[] | null {
  if (!ep || !(ANIME_ENTRY_ID.test(metaId) || ep.sourceMetaId || ep.kitsuStreamId)) return null;
  if (season == null || episode == null) return null;
  const stream = ep.kitsuStreamId?.match(/^(kitsu:\d+):(\d+)$/);
  const owner = ep.sourceMetaId ?? stream?.[1] ?? metaId;
  const native = ANIME_ENTRY_ID.test(owner);
  const nativeSeason = stream && !ANIME_ENTRY_ID.test(metaId) ? (ep.imdbSeason === 0 ? 0 : 1) : season;
  return animeEpisodeCoordinates({
    id: native ? 1 : -1, number: episode, seasonNumber: nativeSeason,
    streamId: ep.kitsuStreamId, sourceMetaId: owner,
    imdbId: ep.imdbId, imdbSeason: ep.imdbSeason, imdbEpisode: ep.imdbEpisode,
  } as KitsuEpisode, metaId);
}
