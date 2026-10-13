import { useMemo, useState, type FormEvent } from "react";
import { Bookmark, BookmarkPlus, LogOut, Pencil, Trash2 } from "lucide-react";
import { api, type Place, type PlaceInput, type User } from "./api";
import { dayLabel } from "./format";
import { fill } from "./i18n";
import { seasonOf, timeZoneAt, type SeasonKey } from "./sun";
import { Dialog, Empty, message, Spinner, useUi } from "./ui";

type Filter = "all" | SeasonKey | "none";
const SEASONS: SeasonKey[] = ["spring", "summer", "autumn", "winter"];

function placeSeason(place: Place): SeasonKey | "none" {
  return place.date ? seasonOf(place.date, timeZoneAt(place), place.lat) : "none";
}

export function PlacesCard({
  user,
  setupRequired,
  places,
  activeId,
  onSignIn,
  onSignOut,
  onSave,
  onOpen,
  onEdit,
  onDelete,
}: {
  user: User | null;
  setupRequired: boolean;
  places: Place[];
  activeId: string | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onSave: () => void;
  onOpen: (place: Place) => void;
  onEdit: (place: Place) => void;
  onDelete: (place: Place) => void;
}) {
  const { t, lang } = useUi();
  const [filter, setFilter] = useState<Filter>("all");
  const seasons = useMemo(() => new Map(places.map((p) => [p.id, placeSeason(p)])), [places]);
  const present = new Set(seasons.values());
  const shown = filter === "all" ? places : places.filter((p) => seasons.get(p.id) === filter);
  const filters: Filter[] = ["all", ...SEASONS.filter((s) => present.has(s)), ...(present.has("none") ? ["none" as const] : [])];
  const label = (f: Filter) => (f === "all" ? t.allPlaces : f === "none" ? t.anyDate : t[f]);

  return (
    <section className="card places" aria-labelledby="places-title">
      <header className="card-header">
        <h2 id="places-title">{t.places}</h2>
        {user && (
          <div className="card-actions">
            <button className="button small" onClick={onSave}>
              <BookmarkPlus size={15} />
              {t.savePlace}
            </button>
            <button className="icon-button" aria-label={t.signOut} title={t.signOut} onClick={onSignOut}>
              <LogOut size={16} />
            </button>
          </div>
        )}
      </header>
      {!user ? (
        <div className="places-locked">
          <p>{setupRequired ? t.setupNeeded : t.signInBody}</p>
          {!setupRequired && (
            <button className="button secondary" onClick={onSignIn}>
              {t.signInToSave}
            </button>
          )}
        </div>
      ) : !places.length ? (
        <Empty icon={<Bookmark size={22} />} title={t.noPlaces} body={t.noPlacesBody} />
      ) : (
        <>
          {filters.length > 2 && (
            <div className="chips" role="group" aria-label={t.places}>
              {filters.map((f) => (
                <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {label(f)}
                </button>
              ))}
            </div>
          )}
          {!shown.length && <p className="muted small-note">{t.noMatchingPlaces}</p>}
          <ul className="place-list">
            {shown.map((place) => {
              const season = seasons.get(place.id)!;
              return (
                <li key={place.id} className={place.id === activeId ? "active" : ""}>
                  <button className="place-open" onClick={() => onOpen(place)} aria-label={fill(t.openPlace, { name: place.name })}>
                    <span className={`place-dot season-${season}`} aria-hidden="true" />
                    <span className="place-text">
                      <strong>{place.name}</strong>
                      <small>
                        {place.date ? `${dayLabel(place.date, lang)} · ${t[season as SeasonKey]}` : t.anyDate}
                      </small>
                      {place.note && <span className="place-note">{place.note}</span>}
                    </span>
                  </button>
                  <div className="place-actions" role="group" aria-label={fill(t.placeActions, { name: place.name })}>
                    <button className="icon-button" aria-label={t.edit} title={t.edit} onClick={() => onEdit(place)}>
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-button danger-text"
                      aria-label={t.delete}
                      title={t.delete}
                      onClick={() => onDelete(place)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

export function PlaceDialog({
  initial,
  editing,
  onClose,
  onSaved,
}: {
  initial: PlaceInput;
  editing: Place | null;
  onClose: () => void;
  onSaved: (place: Place) => void;
}) {
  const { t, notify } = useUi();
  const [name, setName] = useState(initial.name);
  const [note, setNote] = useState(initial.note || "");
  const [date, setDate] = useState(initial.date || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = { name, note: note || null, date: date || null };
      const result = editing
        ? await api<{ place: Place }>(`/api/places/${editing.id}`, "PATCH", body)
        : await api<{ place: Place }>("/api/places", "POST", { ...initial, ...body });
      notify({ message: editing ? t.placeUpdated : t.placeSaved });
      onSaved(result.place);
    } catch (e) {
      setError(message(e, t));
      setBusy(false);
    }
  };
  const title = editing ? t.editPlace : t.savePlace;
  return (
    <Dialog label={title} onClose={onClose} className="form-dialog">
      <form onSubmit={submit}>
        <h2>{title}</h2>
        <div className="field">
          <label htmlFor="place-name">{t.name}</label>
          <input id="place-name" value={name} maxLength={120} required autoFocus onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="place-date">{t.date}</label>
          <input id="place-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <small>{date ? null : t.anyDate}</small>
        </div>
        <div className="field">
          <label htmlFor="place-note">{t.note}</label>
          <textarea
            id="place-note"
            rows={3}
            maxLength={1000}
            placeholder={t.notePlaceholder}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            {t.cancel}
          </button>
          <button className="button" disabled={busy || !name.trim()}>
            {busy && <Spinner size={15} />}
            {t.save}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function SignInDialog({
  setupToken,
  onClose,
  onSignedIn,
}: {
  setupToken: string | null;
  onClose: () => void;
  onSignedIn: (user: User) => void;
}) {
  const { t } = useUi();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const setup = !!setupToken;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = setup
        ? await api<{ user: User }>("/api/auth/setup", "POST", { token: setupToken, username, password })
        : await api<{ user: User }>("/api/auth/login", "POST", { username, password });
      onSignedIn(result.user);
    } catch (e) {
      setError(message(e, t));
      setBusy(false);
    }
  };
  const title = setup ? t.setupTitle : t.signIn;
  return (
    <Dialog label={title} onClose={onClose} className="form-dialog">
      <form onSubmit={submit}>
        <h2>{title}</h2>
        <p className="muted">{setup ? t.setupBody : t.signInBody}</p>
        <div className="field">
          <label htmlFor="auth-username">{t.username}</label>
          <input
            id="auth-username"
            autoComplete="username"
            autoCapitalize="none"
            required
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="auth-password">{t.password}</label>
          <input
            id="auth-password"
            type="password"
            autoComplete={setup ? "new-password" : "current-password"}
            minLength={setup ? 10 : undefined}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {setup && <small>{t.passwordHint}</small>}
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button className="button full" disabled={busy}>
            {busy && <Spinner size={15} />}
            {setup ? t.createAccount : t.signIn}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
