"use client";

export interface GraphSearchFieldProps {
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  readonly matchCount: number;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly query: string;
  readonly testId?: string;
}

/**
 * The reference dictionary keeps a persistent search field in the top-left
 * corner. It stays collapsed to a single glyph until it is focused or holds a
 * query, then expands and reports the number of matched terms.
 */
export function GraphSearchField({
  inputRef,
  matchCount,
  onChange,
  onSubmit,
  query,
  testId = "graph-search-input",
}: GraphSearchFieldProps) {
  const active = query.trim().length > 0;
  const hint = matchCount === 0
    ? "no matches"
    : `${matchCount} ${matchCount === 1 ? "term" : "terms"}`;

  return (
    <div className="graph-search" data-active={active ? "true" : "false"}>
      <div className="graph-search-field" data-active={active ? "true" : "false"}>
        <button
          aria-label="Search the dictionary"
          className="graph-search-trigger"
          onClick={() => {
            inputRef.current?.focus();
            inputRef.current?.select();
          }}
          type="button"
        >
          <svg aria-hidden="true" className="graph-search-icon" viewBox="0 0 24 24">
            <path d="m20 20-4.6-4.6m2.1-5.15a7.25 7.25 0 1 1-14.5 0 7.25 7.25 0 0 1 14.5 0Z" />
          </svg>
        </button>
        <input
          aria-label="Search the dictionary"
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          data-testid={testId}
          enterKeyHint="search"
          id="graph-search"
          name="q"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            onSubmit();
          }}
          placeholder="Search the dictionary"
          ref={inputRef}
          spellCheck={false}
          type="search"
          value={query}
        />
        {active && (
          <button
            aria-label="Clear search"
            className="graph-search-clear"
            onClick={() => onChange("")}
            type="button"
          >
            ×
          </button>
        )}
      </div>
      <span
        aria-live="polite"
        className="graph-search-hint"
        data-show={active ? "true" : "false"}
      >
        {hint}
      </span>
    </div>
  );
}
