import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getTripWeather } from "@/lib/weather";

const TRIP_START = new Date("2027-01-08T09:00:00-07:00");

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "You've Got A Friend In Me · Disneyland Countdown Jan 8–10 2027" },
      {
        name: "description",
        content:
          "Our girls trip hub: a live countdown to Disneyland, the day-by-day itinerary, weather, a shared photo album, a notes wall, plus ride voting and craft tracking.",
      },
      { property: "og:title", content: "You've Got A Friend In Me · Disneyland Countdown" },
      {
        property: "og:description",
        content:
          "Countdown, itinerary, weather, shared photos, notes wall and voting for our January 2027 Disneyland weekend.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

/* --------------------------------- effects -------------------------------- */

function triggerSparkle(e: React.MouseEvent | React.FormEvent | MouseEvent) {
  const count = 12;
  
  // Attempt to grab mouse coordinates, default to center screen if triggered via keyboard
  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;

  if ('clientX' in e && typeof e.clientX === 'number') {
    x = e.clientX;
    y = e.clientY;
  } else if ('nativeEvent' in e && e.nativeEvent instanceof MouseEvent) {
    x = e.nativeEvent.clientX;
    y = e.nativeEvent.clientY;
  }

  for (let i = 0; i < count; i++) {
    const sparkle = document.createElement("div");
    sparkle.className = "fixed pointer-events-none z-[9999] text-xl select-none";
    sparkle.textContent = "✨";
    sparkle.style.left = `${x}px`;
    sparkle.style.top = `${y}px`;
    
    const angle = (Math.PI * 2 * i) / count;
    const velocity = 40 + Math.random() * 60;
    const tx = Math.cos(angle) * velocity;
    const ty = Math.sin(angle) * velocity;
    
    document.body.appendChild(sparkle);
    
    sparkle.animate([
      { transform: 'translate(-50%, -50%) scale(0) rotate(0deg)', opacity: 1 },
      { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(1.5) rotate(${Math.random() * 90}deg)`, opacity: 1, offset: 0.6 },
      { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0) rotate(${Math.random() * 180}deg)`, opacity: 0 }
    ], {
      duration: 800 + Math.random() * 300,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
      fill: 'forwards'
    });
    
    setTimeout(() => sparkle.remove(), 1200);
  }
}

/* ---------------------------------- data ---------------------------------- */

type Photo = { id: string; storage_path: string; caption: string | null; uploaded_by: string | null; url?: string };
type VoteItem = { id: string; name: string; added_by: string | null; votes: number };
type Note = { id: string; author: string | null; body: string; created_at: string };
type CraftItem = { id: string; title: string; pattern_url: string | null; added_by: string | null; created_at: string };

function useNickname() {
  const [name, setName] = useState("");
  useEffect(() => {
    setName(localStorage.getItem("squad-name") ?? "");
  }, []);
  const save = (value: string) => {
    setName(value);
    localStorage.setItem("squad-name", value);
  };
  return { name, save };
}

function usePhotos() {
  return useQuery({
    queryKey: ["photos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_photos")
        .select("id, storage_path, caption, uploaded_by")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Photo[];
      if (rows.length === 0) return [];
      const { data: signed } = await supabase.storage
        .from("trip-photos")
        .createSignedUrls(rows.map((r) => r.storage_path), 60 * 60 * 6);
      return rows.map((row, i) => ({ ...row, url: signed?.[i]?.signedUrl ?? "" }));
    },
  });
}

/** Loosely typed handle: these tables/functions vary by card. */
const db = supabase as unknown as {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
};

function useVoteList(table: "wishlist_items") {
  return useQuery({
    queryKey: [table],
    queryFn: async () => {
      const { data, error } = await db
        .from(table)
        .select("id, name, added_by, votes")
        .order("votes", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as VoteItem[];
    },
  });
}

function useNotes() {
  return useQuery({
    queryKey: ["notes"],
    queryFn: async () => {
      const { data, error } = await db
        .from("trip_notes")
        .select("id, author, body, created_at")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as Note[];
    },
  });
}

function useCrafts() {
  return useQuery({
    queryKey: ["crafts"],
    queryFn: async () => {
      const { data, error } = await db
        .from("trip_crafts")
        .select("id, title, pattern_url, added_by, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CraftItem[];
    },
  });
}

/* -------------------------------- countdown -------------------------------- */

function useCountdown(target: Date) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;
  const diff = Math.max(0, target.getTime() - now.getTime());
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff / 3600000) % 24),
    minutes: Math.floor((diff / 60000) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/* --------------------------------- itinerary -------------------------------- */

const ITINERARY = [
  {
    label: "Day 1 · Fri",
    date: "January 8",
    items: [
      { time: "6:30a", text: "Meet at Provo airport · hoodies on", tone: "plum" },
      { time: "9:00a", text: "Flight out of Provo, UT", tone: "ice" },
      { time: "10:30a", text: "Land in Orange County · drop bags at hotel", tone: "plum" },
      { time: "1:00p", text: "California Adventure all afternoon", tone: "ice" },
      { time: "6:30p", text: "Dinner on the pier + evening show", tone: "plum" },
    ],
  },
  {
    label: "Day 2 · Sat",
    date: "January 9",
    items: [
      { time: "8:00a", text: "Breakfast, then rope drop Disneyland", tone: "ice" },
      { time: "12:30p", text: "Lunch in Galaxy's Edge · blue milk", tone: "plum" },
      { time: "3:00p", text: "Castle photo, all of us in hoodies", tone: "ice" },
      { time: "6:00p", text: "Dinner break, then back for night rides", tone: "plum" },
      { time: "9:30p", text: "Fireworks + churros on Main Street", tone: "ice" },
    ],
  },
  {
    label: "Day 3 · Sun",
    date: "January 10",
    items: [
      { time: "9:00a", text: "Pack up + check out of hotel", tone: "plum" },
      { time: "10:00a", text: "Beach morning · walk, photos, salt air", tone: "ice" },
      { time: "12:30p", text: "Lunch by the water", tone: "plum" },
      { time: "2:45p", text: "Head to the airport", tone: "ice" },
      { time: "5:00p", text: "Flight home", tone: "plum" },
    ],
  },
];

/* ----------------------------------- page ---------------------------------- */

function Index() {
  const countdown = useCountdown(TRIP_START);
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative min-h-screen overflow-hidden font-body text-ink">
      <div
        className="pointer-events-none absolute -top-40 -left-32 size-[520px] rounded-full opacity-70"
        style={{ background: "var(--glow-ice)" }}
      />
      <div
        className="pointer-events-none absolute top-10 right-[-160px] size-[560px] rounded-full opacity-60"
        style={{ background: "var(--glow-plum)" }}
      />
      <div
        className="pointer-events-none absolute bottom-[-220px] left-1/3 size-[620px] rounded-full opacity-60"
        style={{ background: "var(--glow-sky)" }}
      />
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 size-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40"
        style={{ background: "var(--glow-white)" }}
      />

      <header className="relative z-10 mx-auto max-w-6xl px-6 pt-8">
        <div className="frost flex flex-wrap items-center justify-between gap-4 rounded-2xl px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="brand-gradient grid size-10 place-items-center rounded-xl font-display text-lg text-primary-foreground">
              F
            </div>
            <div>
              <p className="font-display text-sm leading-none font-semibold tracking-tight">
                You&rsquo;ve Got A Friend In Me
              </p>
              <p className="mt-1 text-[11px] tracking-wide text-ink-soft">
                Disneyland&nbsp;·&nbsp;Girls Trip 2027
              </p>
            </div>
          </div>
          <nav className="hidden items-center gap-1 text-sm text-ink-soft lg:flex">
            <a className="rounded-lg px-3 py-2 font-medium text-ink" href="#countdown">Countdown</a>
            <a className="rounded-lg px-3 py-2 font-medium transition hover:text-ink" href="#itinerary">Itinerary</a>
            <a className="rounded-lg px-3 py-2 font-medium transition hover:text-ink" href="#gallery">Gallery</a>
            <a className="rounded-lg px-3 py-2 font-medium transition hover:text-ink" href="#weather">Weather</a>
            <a className="rounded-lg px-3 py-2 font-medium transition hover:text-ink" href="#crafts">Crafts</a>
            <a className="rounded-lg px-3 py-2 font-medium transition hover:text-ink" href="#notes">Notes</a>
          </nav>
          <button
            onClick={copyLink}
            className="frost-deep rounded-xl px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-105"
          >
            {copied ? "Link copied!" : "Share link"}
          </button>
        </div>
      </header>

      <section id="countdown" className="relative z-10 mx-auto max-w-6xl px-6 pt-8">
        <div className="frost-deep grid items-center gap-10 rounded-[28px] p-8 md:p-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-xs font-semibold tracking-[0.3em] text-ice-deep uppercase">
              You&rsquo;ve got a friend in me
            </p>
            <h1 className="mt-4 text-4xl leading-[1.05] tracking-tight md:text-5xl">
              Counting down to the <span className="text-gradient">Magic Kingdom</span>
            </h1>
            <p className="mt-4 max-w-md leading-relaxed text-ink-soft">
              January 8–10, 2027 · Provo to Anaheim · California Adventure, Disneyland, and a
              beach morning before we fly home.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <div
                className="rounded-xl px-4 py-2 text-sm font-semibold text-ink"
                style={{
                  background:
                    "linear-gradient(135deg, oklch(0.709 0.088 257.9 / 35%), oklch(0.704 0.1 317 / 30%))",
                }}
              >
                <span className="font-display">Jan 8</span>
                <span className="mx-2 text-ink-soft">→</span>
                <span className="font-display">Jan 10</span>
              </div>
              <span className="text-sm text-ink-soft">Matching hoodies required</span>
            </div>
          </div>

          <div className="frost rounded-3xl p-8 text-center">
            <p className="text-xs font-semibold tracking-[0.3em] text-ink-soft uppercase">
              Days to go
            </p>
            <p className="numerals-gradient my-2 font-display text-[7rem] leading-none font-semibold tabular-nums">
              {countdown ? countdown.days : "—"}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { value: countdown ? pad(countdown.hours) : "--", label: "hrs" },
                { value: countdown ? pad(countdown.minutes) : "--", label: "min" },
                { value: countdown ? pad(countdown.seconds) : "--", label: "sec" },
              ].map((unit) => (
                <div key={unit.label} className="frost-inset rounded-xl py-3">
                  <p className="font-display text-2xl font-semibold tabular-nums">{unit.value}</p>
                  <p className="text-[10px] tracking-widest text-ink-soft uppercase">{unit.label}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 text-[11px] tracking-wide text-ink-soft">
              Until wheels up from Provo, 9:00a
            </p>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto grid max-w-6xl gap-6 px-6 py-8 md:grid-cols-2 lg:grid-cols-3">
        <ItineraryCard />
        <GalleryCard />
        <WeatherCard />
        <VoteCard
          id="wishlist"
          table="wishlist_items"
          rpc="increment_wishlist_vote"
          title="Ride wishlist"
          unit="ideas"
          placeholder="Add a ride…"
          storageKey="squad-votes"
        />
        <CraftTrackerCard />
        <NotesWall />
        <SoundtrackCard />
      </section>

      <footer className="relative z-10 mx-auto max-w-6xl px-6 pb-10 text-center text-xs text-ink-soft/70">
        You&rsquo;ve Got A Friend In Me · made with love for the girls · 2027
      </footer>
    </div>
  );
}

/* --------------------------------- itinerary -------------------------------- */

function ItineraryCard() {
  const [day, setDay] = useState(0);
  const active = ITINERARY[day]!;

  return (
    <div id="itinerary" className="frost rounded-3xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Itinerary</h2>
        <span className="text-[11px] font-semibold text-ice-deep">{active.label}</span>
      </div>
      <div className="mt-4 flex gap-2">
        {ITINERARY.map((d, i) => (
          <button
            key={d.date}
            onClick={() => setDay(i)}
            className={
              i === day
                ? "brand-gradient rounded-lg px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                : "frost-inset rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:text-ink"
            }
          >
            {d.date.replace("January ", "Jan ")}
          </button>
        ))}
      </div>
      <ul className="mt-4 space-y-3 text-sm">
        {active.items.map((item) => (
          <li key={item.time + item.text} className="flex items-start gap-3">
            <span
              className={`mt-1.5 size-2 shrink-0 rounded-full ${
                item.tone === "ice" ? "bg-ice-deep" : "bg-plum"
              }`}
            />
            <span className="w-12 shrink-0 text-ink-soft">{item.time}</span>
            <span className="font-medium">{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------- weather --------------------------------- */

function WeatherCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["weather"],
    queryFn: getTripWeather,
    staleTime: 1000 * 60 * 60 * 6,
  });

  return (
    <div id="weather" className="frost rounded-3xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Weather</h2>
        <span className="text-[11px] font-semibold text-ice-deep">
          {data?.kind === "forecast" ? "forecast" : "last January"}
        </span>
      </div>

      {isLoading && <p className="mt-4 text-sm text-ink-soft">Checking the skies…</p>}
      {isError && <p className="mt-4 text-sm text-ink-soft">Weather is unavailable right now.</p>}

      <ul className="mt-4 space-y-3 text-sm">
        {(data?.days ?? []).map((day) => (
          <li key={day.date} className="frost-inset rounded-xl px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{day.label}</span>
              <span className="font-display text-base font-semibold tabular-nums">
                {day.high}°<span className="text-ink-soft">/{day.low}°</span>
              </span>
            </div>
            <p className="mt-1 text-[11px] text-ink-soft">
              {day.place} · {day.rain > 0.01 ? `${day.rain.toFixed(2)}" rain` : "dry"}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[11px] leading-relaxed text-ink-soft">
        {data?.kind === "forecast"
          ? "Live forecast for our dates, updated automatically."
          : "Real forecasts start about two weeks out — for now these are the same dates last year, so pack a light jacket."}
      </p>
    </div>
  );
}

/* ---------------------------------- gallery --------------------------------- */

function GalleryCard() {
  const { data: photos, isLoading } = usePhotos();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const { name, save } = useNickname();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const path = `${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("trip-photos").upload(path, file);
        if (upErr) throw upErr;
        const { error: rowErr } = await supabase
          .from("trip_photos")
          .insert({ storage_path: path, uploaded_by: name || null });
        if (rowErr) throw rowErr;
      }
      await queryClient.invalidateQueries({ queryKey: ["photos"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const shown = (photos ?? []).slice(0, 4);

  return (
    <div id="gallery" className="frost rounded-3xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Shared gallery</h2>
        <span className="text-[11px] font-semibold text-ice-deep">
          {isLoading ? "loading…" : `${photos?.length ?? 0} uploads`}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {shown.map((media) => {
          const isVideo = media.storage_path.match(/\.(mp4|mov|webm|ogg)$/i);
          return (
            <div
              key={media.id}
              className="group relative aspect-square overflow-hidden rounded-xl bg-frost-deep"
            >
              {isVideo ? (
                <video src={media.url} controls className="size-full object-cover" />
              ) : (
                <a href={media.url} target="_blank" rel="noreferrer">
                  <img
                    src={media.url}
                    alt={media.caption ?? `Trip media shared by ${media.uploaded_by ?? "the squad"}`}
                    loading="lazy"
                    className="size-full object-cover transition duration-300 hover:scale-105"
                  />
                </a>
              )}
              
              <a 
                href={media.url} 
                download={media.storage_path}
                className="absolute bottom-2 right-2 flex size-8 items-center justify-center rounded-lg bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); triggerSparkle(e); }}
                title="Download"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </a>
            </div>
          );
        })}
        {shown.length === 0 && (
          <div className="col-span-2 rounded-xl border border-dashed border-ice px-4 py-8 text-center text-sm text-ink-soft">
            No photos or videos yet — be the first to share one.
          </div>
        )}
      </div>

      <input
        value={name}
        onChange={(e) => save(e.target.value)}
        placeholder="Your name (so we know who posted)"
        className="mt-4 w-full rounded-xl bg-input px-3 py-2 text-sm placeholder:text-ink-soft/70 focus:ring-2 focus:ring-ring focus:outline-none"
      />
      <input
        ref={fileInput}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
      <button
        onClick={(e) => {
          triggerSparkle(e);
          fileInput.current?.click();
        }}
        disabled={uploading}
        className="brand-gradient mt-3 w-full rounded-xl py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-105 disabled:opacity-60"
      >
        {uploading ? "Uploading…" : "+ Upload a photo or video"}
      </button>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}

/* ------------------------------- vote lists -------------------------------- */

function VoteCard({
  id,
  table,
  rpc,
  title,
  unit,
  placeholder,
  storageKey,
}: {
  id: string;
  table: "wishlist_items";
  rpc: "increment_wishlist_vote";
  title: string;
  unit: string;
  placeholder: string;
  storageKey: string;
}) {
  const { data: items } = useVoteList(table);
  const queryClient = useQueryClient();
  const { name } = useNickname();
  const [voted, setVoted] = useState<string[]>([]);
  const [newItem, setNewItem] = useState("");

  useEffect(() => {
    setVoted(JSON.parse(localStorage.getItem(storageKey) ?? "[]"));
  }, [storageKey]);

  const vote = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await db.rpc(rpc, { item_id: itemId });
      if (error) throw error;
      const next = [...voted, itemId];
      setVoted(next);
      localStorage.setItem(storageKey, JSON.stringify(next));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [table] }),
  });

  const add = useMutation({
    mutationFn: async () => {
      const value = newItem.trim();
      if (!value) return;
      const { error } = await db.from(table).insert({ name: value, added_by: name || null });
      if (error) throw error;
      setNewItem("");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [table] }),
  });

  return (
    <div id={id} className="frost rounded-3xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-[11px] font-semibold text-ice-deep">
          {items?.length ?? 0} {unit}
        </span>
      </div>
      <ul className="mt-4 space-y-2.5 text-sm">
        {(items ?? []).map((item) => (
          <li key={item.id} className="frost-inset flex items-center justify-between gap-2 rounded-xl px-3 py-2">
            <span className="font-medium">{item.name}</span>
            <button
              onClick={(e) => {
                triggerSparkle(e);
                vote.mutate(item.id);
              }}
              disabled={voted.includes(item.id)}
              className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-ice-deep transition hover:text-plum disabled:text-ink-soft"
              aria-label={`Vote for ${item.name}`}
            >
              ▲ {item.votes}
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          triggerSparkle(e);
          add.mutate();
        }}
        className="mt-4 flex gap-2"
      >
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-xl bg-input px-3 py-2 text-sm placeholder:text-ink-soft/70 focus:ring-2 focus:ring-ring focus:outline-none"
        />
        <button
          type="submit"
          className="frost-inset rounded-xl px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-105"
        >
          Add
        </button>
      </form>
    </div>
  );
}

/* ----------------------------- craft tracker ----------------------------- */

function CraftTrackerCard() {
  const { data: crafts } = useCrafts();
  const queryClient = useQueryClient();
  const { name } = useNickname();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      if (!title.trim()) return;
      const { error } = await db.from("trip_crafts").insert({ 
        title: title.trim(), 
        pattern_url: url.trim() || null,
        added_by: name || null 
      });
      if (error) throw error;
      setTitle("");
      setUrl("");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crafts"] }),
  });

  return (
    <div id="crafts" className="frost rounded-3xl p-6 md:col-span-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Travel Craft Board</h2>
        <span className="text-[11px] font-semibold text-ice-deep">{crafts?.length ?? 0} projects</span>
      </div>
      
      <div className="mt-5 columns-1 sm:columns-2 gap-4 space-y-4">
        {(crafts ?? []).map((craft) => (
          <div key={craft.id} className="frost-inset break-inside-avoid rounded-2xl p-4 transition hover:bg-white/40">
            <h3 className="font-medium text-sm">{craft.title}</h3>
            {craft.pattern_url && (
              <a 
                href={craft.pattern_url} 
                target="_blank" 
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-plum hover:underline"
              >
                View Pattern ↗
              </a>
            )}
            <p className="mt-3 text-[10px] text-ink-soft uppercase tracking-wider">
              {craft.added_by || "someone"}
            </p>
          </div>
        ))}
        {(!crafts || crafts.length === 0) && (
          <div className="break-inside-avoid rounded-2xl border border-dashed border-ice px-4 py-8 text-center text-sm text-ink-soft">
            No projects added yet — pin what you're bringing on the flight!
          </div>
        )}
      </div>

      <form 
        onSubmit={(e) => {
          e.preventDefault();
          triggerSparkle(e);
          add.mutate();
        }} 
        className="mt-6 flex flex-col gap-2 sm:flex-row"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What are you making? (e.g. needlepoint canvas)"
          className="flex-1 rounded-xl bg-input px-3 py-2 text-sm placeholder:text-ink-soft/70 focus:ring-2 focus:ring-ring focus:outline-none"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Pattern link (Ravelry, etc.)"
          className="flex-1 rounded-xl bg-input px-3 py-2 text-sm placeholder:text-ink-soft/70 focus:ring-2 focus:ring-ring focus:outline-none"
        />
        <button
          type="submit"
          disabled={add.isPending}
          className="frost-deep rounded-xl px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-105 disabled:opacity-60"
        >
          Pin it
        </button>
      </form>
    </div>
  );
}

/* ------------------------------ trip soundtrack ----------------------------- */

function SoundtrackCard() {
  return (
    <div id="soundtrack" className="frost rounded-3xl p-6 md:col-span-2 lg:col-span-1 lg:row-span-2">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Trip Soundtrack</h2>
        <span className="text-[11px] font-semibold text-ice-deep">Spotify</span>
      </div>
      <div className="overflow-hidden rounded-xl bg-frost-deep">
        <iframe 
          style={{ borderRadius: '12px' }} 
          src="https://open.spotify.com/embed/playlist/37i9dQZF1DXa2PvUqytDZj?utm_source=generator&theme=0" 
          width="100%" 
          height="352" 
          frameBorder="0" 
          allowFullScreen={false} 
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
          loading="lazy"
        />
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-ink-soft">
        A mix of 90s Alternative and our favorites. Let me know if you want editing access to add tracks!
      </p>
    </div>
  );
}

/* -------------------------------- notes wall -------------------------------- */

function NotesWall() {
  const { data: notes, isLoading } = useNotes();
  const queryClient = useQueryClient();
  const { name, save } = useNickname();
  const [body, setBody] = useState("");

  const post = useMutation({
    mutationFn: async () => {
      const text = body.trim();
      if (!text) return;
      const { error } = await db.from("trip_notes").insert({ body: text, author: name || null });
      if (error) throw error;
      setBody("");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes"] }),
  });

  return (
    <div id="notes" className="frost rounded-3xl p-6 md:col-span-2 lg:col-span-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Notes wall</h2>
        <span className="text-[11px] font-semibold text-ice-deep">
          {isLoading ? "loading…" : `${notes?.length ?? 0} notes`}
        </span>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          triggerSparkle(e);
          post.mutate();
        }}
        className="mt-4 grid gap-2 sm:grid-cols-[180px_1fr_auto]"
      >
        <input
          value={name}
          onChange={(e) => save(e.target.value)}
          placeholder="Your name"
          className="rounded-xl bg-input px-3 py-2 text-sm placeholder:text-ink-soft/70 focus:ring-2 focus:ring-ring focus:outline-none"
        />
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={500}
          placeholder="Say something to the group…"
          className="min-w-0 rounded-xl bg-input px-3 py-2 text-sm placeholder:text-ink-soft/70 focus:ring-2 focus:ring-ring focus:outline-none"
        />
        <button
          type="submit"
          disabled={post.isPending}
          className="brand-gradient rounded-xl px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-105 disabled:opacity-60"
        >
          Post
        </button>
      </form>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {(notes ?? []).map((note) => (
          <div key={note.id} className="frost-inset rounded-2xl px-4 py-3">
            <p className="text-sm leading-relaxed font-medium">{note.body}</p>
            <p className="mt-2 text-[11px] text-ink-soft">
              {note.author || "someone"} ·{" "}
              {new Date(note.created_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </p>
          </div>
        ))}
        {!isLoading && (notes?.length ?? 0) === 0 && (
          <p className="rounded-2xl border border-dashed border-ice px-4 py-6 text-center text-sm text-ink-soft sm:col-span-2 lg:col-span-3">
            Nothing here yet — leave the first note for the group.
          </p>
        )}
      </div>
    </div>
  );
}
