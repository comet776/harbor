import { useEffect, useState } from "react";
import { relatedLibraryIds } from "@/lib/providers/anime-mapping";

const EMPTY = new Map<string, string[]>();

/** Public provider mappings, scoped to an entry rather than its entire franchise. */
export function useAnimeEntryAliases(entryIds: string[]): Map<string, string[]> {
  const signature = entryIds.join("|");
  const [state, setState] = useState<{ signature: string; aliases: Map<string, string[]> } | null>(null);
  useEffect(() => {
    let cancelled = false;
    let index = 0;
    const aliases = new Map<string, string[]>();
    const worker = async () => {
      while (!cancelled && index < entryIds.length) {
        const id = entryIds[index++];
        const ids = await relatedLibraryIds(id).catch(() => []);
        if (cancelled) return;
        aliases.set(id, ids);
        setState({ signature, aliases: new Map(aliases) });
      }
    };
    void Promise.all(Array.from({ length: Math.min(4, entryIds.length) }, worker));
    return () => { cancelled = true; };
  }, [signature]);
  return state?.signature === signature ? state.aliases : EMPTY;
}
