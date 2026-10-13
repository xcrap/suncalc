import { useEffect, useRef, useState } from "react";
import { MapPin, Search as SearchIcon, X } from "lucide-react";
import { api, type SearchResult } from "./api";
import { message, Spinner, useUi } from "./ui";

const COORDINATES = /^\s*(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/;
function coordinates(text: string) {
  const match = text.match(COORDINATES);
  if (!match) return null;
  const lat = Number(match[1].replace(",", ".")),
    lng = Number(match[2].replace(",", "."));
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

export function Search({
  viewbox,
  onPick,
}: {
  viewbox: () => string | undefined;
  onPick: (result: { lat: number; lng: number; name?: string }) => void;
}) {
  const { t, lang } = useUi();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!results && !error) return;
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setResults(null);
        setError("");
      }
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [results, error]);

  // Nominatim forbids autocomplete, so the search runs on submit only.
  const submit = async () => {
    const text = query.trim();
    if (!text) return;
    const point = coordinates(text);
    if (point) {
      onPick(point);
      setResults(null);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({ q: text, lang });
      const box = viewbox();
      if (box) params.set("viewbox", box);
      const data = await api<{ results: SearchResult[] }>(`/api/geocode/search?${params}`);
      setResults(data.results);
    } catch (e) {
      setResults(null);
      setError(message(e, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      ref={root}
      className="search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label className="search-field">
        {busy ? <Spinner size={16} /> : <SearchIcon size={16} aria-hidden="true" />}
        <input
          type="search"
          enterKeyHint="search"
          aria-label={t.searchLabel}
          placeholder={t.searchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setResults(null);
              setError("");
            }
          }}
        />
        {query && (
          <button
            type="button"
            className="icon-button"
            aria-label={t.close}
            onClick={() => {
              setQuery("");
              setResults(null);
              setError("");
            }}
          >
            <X size={15} />
          </button>
        )}
      </label>
      {(results || error) && (
        <div className="search-results">
          {error && <p className="search-note">{error}</p>}
          {results && !results.length && <p className="search-note">{t.searchEmpty}</p>}
          {results?.map((result) => (
            <button
              type="button"
              key={`${result.lat},${result.lng}`}
              onClick={() => {
                onPick(result);
                setResults(null);
                setQuery(result.name);
              }}
            >
              <MapPin size={16} aria-hidden="true" />
              <span>
                <strong>{result.name}</strong>
                {result.area && <small>{result.area}</small>}
              </span>
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
