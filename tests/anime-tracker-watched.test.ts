import assert from "node:assert/strict";
import test from "node:test";
import { airedOnly } from "../src/lib/aired.ts";
import * as identity from "../src/lib/anime-episode-identity.ts";
import { flushPromises, hookHarness } from "./helpers/hook-harness.ts";

const ep = (number: number, extra: Record<string, unknown> = {}): any => ({
  id: number, number, seasonNumber: 1, airdate: null, ...extra,
});
const deferred = () => {
  let resolve!: (value: any) => void;
  const promise = new Promise<any>((r) => { resolve = r; });
  return { promise, resolve };
};

function harness(load: (id: string) => Promise<any>) {
  let profile = "one";
  const listeners = new Set<() => void>();
  const mocks = {
    "@/lib/active-profile-id": { activeProfileId: () => profile },
    "@/lib/profiles": { useProfiles: () => ({ activeProfile: { id: profile } }) },
    "@/lib/aired": { airedOnly },
    "@/lib/anime-episode-identity": identity,
  };
  const factory = hookHarness("src/lib/use-anime-tracker-watched.ts", "createAnimeEntryLoader", mocks);
  const loader = factory.render(load);
  const hook = hookHarness("src/lib/use-anime-tracker-watched.ts", "useAnimeTrackerWatched", mocks);
  const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
  return { loader, hook, render: (groups: Map<string, any[]>, session: object, connected = true) =>
    hook.render(groups, session, connected, loader, subscribe),
    sync: () => { for (const fn of listeners) fn(); },
    selectProfile: (id: string) => { profile = id; } };
}

test("tracker counts apply to native numbers in sparse lists, with aired and total limits", async () => {
  const h = harness(async () => ({ progress: 2, total: 3, completed: false }));
  const groups = new Map([["kitsu:1", [ep(1, { airdate: "2020-01-01" }), ep(3), ep(4), ep(2, { airdate: "2999-01-01" })]]]);
  const session = {};
  h.render(groups, session); await flushPromises();
  assert.deepEqual([...h.render(groups, session).watched.get("kitsu:1")], ["1:1"]);
});

test("two cours with E1 project AniList/MAL progress independently", async () => {
  const h = harness(async (id) => ({ progress: id === "kitsu:1" ? 1 : 0, total: 12, completed: false }));
  const groups = new Map([["kitsu:1", [ep(1)]], ["kitsu:2", [ep(1)]]]);
  const session = {};
  h.render(groups, session); await flushPromises();
  const result = h.render(groups, session);
  assert.equal(result.watched.get("kitsu:1").has("1:1"), true);
  assert.equal(result.watched.get("kitsu:2").has("1:1"), false);
});

test("entry changes immediately clear old marks and ignore a delayed former entry", async () => {
  const old = deferred();
  const h = harness(async (id) => id === "kitsu:1" ? old.promise : null);
  const session = {};
  h.render(new Map([["kitsu:1", [ep(1)]]]), session);
  const next = new Map([["kitsu:2", [ep(1)]]]);
  assert.equal(h.render(next, session).watched.size, 0);
  old.resolve({ progress: 1, total: 12, completed: false }); await flushPromises();
  assert.equal(h.render(next, session).watched.size, 0);
});

test("tracker sync invalidates cached counts and refreshes rows without reopening", async () => {
  let progress = 0, calls = 0;
  const h = harness(async () => { calls++; return { progress, total: 12, completed: false }; });
  const session = {}, groups = new Map([["kitsu:1", [ep(1)]]]);
  h.render(groups, session); await flushPromises(); h.render(groups, session);
  assert.equal(calls, 1);
  progress = 1; h.sync(); h.render(groups, session); await flushPromises();
  assert.equal(h.render(groups, session).watched.get("kitsu:1").has("1:1"), true);
  assert.equal(calls, 2);
});

for (const change of ["profile", "account"]) {
  test(`completed data and a delayed request cannot cross a ${change} change`, async () => {
    const gate = deferred();
    let next = false;
    const h = harness(async () => next ? null : gate.promise);
    let session = {};
    const groups = new Map([["kitsu:1", [ep(1)]]]);
    h.render(groups, session);
    if (change === "profile") h.selectProfile("two"); else session = {};
    next = true;
    assert.equal(h.render(groups, session).watched.size, 0);
    gate.resolve({ progress: 1, total: 12, completed: true }); await flushPromises();
    assert.equal(h.render(groups, session).watched.size, 0);
  });
}

test("Simkl merges native entry aliases while preserving provider season coordinates", async () => {
  const session = {};
  const map = new Map([["mal:2", new Set(["1:1"])], ["tt100", new Set(["2:14"])]]);
  const h = hookHarness("src/lib/simkl/use-simkl-watched-map.ts", "useSimklWatchedMap", {
    "./provider": { useSimkl: () => ({ isConnected: true, session }) },
    "./session": { getSession: () => session },
    "./list-status": { loadSimklWatchedMap: async () => map, subscribeSimklProgress: () => () => {}, simklProgressVersion: () => 0 },
    "@/lib/active-profile-id": { activeProfileId: () => "one" },
    "@/lib/profiles": { useProfiles: () => ({ activeProfile: { id: "one" } }) },
    "@/lib/anime-episode-identity": identity,
  });
  const aliases = new Map([["kitsu:1", ["mal:2", "tt100"]]]);
  h.render(aliases); await flushPromises();
  const result = h.render(aliases);
  assert.deepEqual([...result.get("kitsu:1")], ["1:1"]);
  assert.deepEqual([...result.get("tt100")], ["2:14"]);
});
