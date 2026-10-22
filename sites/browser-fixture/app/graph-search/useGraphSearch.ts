"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createGraphSearchIndex,
  type GraphInput,
  type GraphSearchMatch,
  type GraphSearchOptions,
  type GraphWorkbench,
} from "@pureliture/graph-workbench";

/**
 * The reference dictionary keeps the running query in the `q` search
 * parameter. The workbench mirrors that contract so a shared link restores the
 * same reading mode.
 */
export const GRAPH_SEARCH_QUERY_PARAMETER = "q";

/** The reference replaces the history entry instead of pushing a new one. */
const GRAPH_SEARCH_URL_THROTTLE_MS = 250;

export interface GraphSearchController {
  /** Applies the current query to a workbench that just became available. */
  apply(): void;
  clear(): void;
  focus(): void;
  readonly matchCount: number;
  readonly matches: readonly GraphSearchMatch[];
  readonly query: string;
  readonly searchInputRef: React.RefObject<HTMLInputElement | null>;
  setQuery(value: string): void;
}

function readQueryFromLocation(): string {
  if (typeof window === "undefined") return "";
  return new URL(window.location.href).searchParams.get(GRAPH_SEARCH_QUERY_PARAMETER) ?? "";
}

function writeQueryToLocation(value: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const trimmed = value.trim();
  if (trimmed.length === 0) url.searchParams.delete(GRAPH_SEARCH_QUERY_PARAMETER);
  else url.searchParams.set(GRAPH_SEARCH_QUERY_PARAMETER, trimmed);
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;
  window.history.replaceState(window.history.state, "", next);
}

/**
 * Owns the fixture-wide search reading mode: the query, the ranked matches,
 * the `?q=` address, and the workbench hand-off.
 */
export function useGraphSearch(
  input: GraphInput,
  workbenchRef: React.RefObject<GraphWorkbench | null>,
  searchOptions?: GraphSearchOptions,
): GraphSearchController {
  const index = useMemo(() => createGraphSearchIndex(input, searchOptions), [input, searchOptions]);
  const [query, setQueryState] = useState("");
  const [matches, setMatches] = useState<readonly GraphSearchMatch[]>([]);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const urlTimerRef = useRef<number | null>(null);
  const queryRef = useRef("");

  const runSearch = useCallback((value: string) => {
    const result = index.search(value);
    setMatches(result.matches);
    return result;
  }, [index]);

  const applyToWorkbench = useCallback((value: string) => {
    const workbench = workbenchRef.current;
    if (!workbench) return;
    workbench.setSearchQuery(value);
  }, [workbenchRef]);

  // Re-applies the running query to a workbench that just became available.
  // The query lives in a ref so this callback stays stable and can be used as
  // an effect dependency.
  const apply = useCallback(() => {
    applyToWorkbench(queryRef.current);
  }, [applyToWorkbench]);

  // Restore a shared link on first load. The restore runs after mount so the
  // server-rendered shell and the hydrated shell stay identical.
  useEffect(() => {
    const initial = readQueryFromLocation();
    if (initial.length === 0) return undefined;
    const restore = window.setTimeout(() => {
      queryRef.current = initial;
      setQueryState(initial);
      runSearch(initial);
    }, 0);
    return () => window.clearTimeout(restore);
  }, [runSearch]);

  // Keep the address in step with the running query.
  useEffect(() => {
    if (urlTimerRef.current !== null) window.clearTimeout(urlTimerRef.current);
    urlTimerRef.current = window.setTimeout(() => {
      urlTimerRef.current = null;
      writeQueryToLocation(query);
    }, GRAPH_SEARCH_URL_THROTTLE_MS);
    return () => {
      if (urlTimerRef.current !== null) {
        window.clearTimeout(urlTimerRef.current);
        urlTimerRef.current = null;
      }
    };
  }, [query]);

  // Browser history restores the query without pushing a new entry.
  useEffect(() => {
    const restore = () => {
      const restored = readQueryFromLocation();
      queryRef.current = restored;
      setQueryState(restored);
      runSearch(restored);
      applyToWorkbench(restored);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [applyToWorkbench, runSearch]);

  const setQuery = useCallback((value: string) => {
    queryRef.current = value;
    setQueryState(value);
    runSearch(value);
    applyToWorkbench(value);
  }, [applyToWorkbench, runSearch]);

  const clear = useCallback(() => {
    setQuery("");
    searchInputRef.current?.focus();
  }, [setQuery]);

  const focus = useCallback(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, []);

  return {
    apply,
    clear,
    focus,
    matchCount: matches.length,
    matches,
    query,
    searchInputRef,
    setQuery,
  };
}
