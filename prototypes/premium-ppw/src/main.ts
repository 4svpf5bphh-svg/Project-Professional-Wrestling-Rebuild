import logo from "../../../apps/web/public/branding/ppw-showcase-header.webp?url";
import stage from "../../../apps/web/public/branding/intro-backdrop.svg?url";
import belt from "../../../apps/web/public/belts/custom-women.svg?url";
import {
  airtime, episode, finishes, firstDraft, orderIsValid, plans, previewResolution, segmentDetails,
  type Draft, type Finish, type FollowThrough, type Plan, type Resolution, type Segment,
} from "./episode.js";
import "./style.css";

type Screen = "week" | "card" | "show" | "season";
type Phase = "open" | "ready" | "revealed";
type Session = {
  draft: Draft;
  phase: Phase;
  followThrough: FollowThrough | null;
  sound: boolean;
};

const storageKey = "ppw-premium-prototype-v1";
const app = document.querySelector<HTMLDivElement>("#app")!;
const announcement = document.querySelector<HTMLElement>("#announcement")!;
const screenNames: Record<Screen, string> = {
  week: "This week",
  card: "The card",
  show: "Ringside",
  season: "Season",
};
const navIcons: Record<Screen, string> = { week: "◫", card: "▤", show: "◉", season: "◇" };
const dollars = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 0,
});
const count = new Intl.NumberFormat("en-US");

function newSession(sound = false): Session {
  return { draft: firstDraft(), phase: "open", followThrough: null, sound };
}

function loadSession(): Session {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (!saved || !saved.draft || !Object.hasOwn(plans, saved.draft.plan) ||
        !Object.hasOwn(finishes, saved.draft.finish) || !orderIsValid(saved.draft.order) ||
        !["open", "ready", "revealed"].includes(saved.phase)) return newSession();
    return {
      draft: saved.draft,
      phase: saved.phase,
      followThrough: saved.phase === "revealed" &&
        (saved.followThrough === "reserve" || saved.followThrough === "reassess")
        ? saved.followThrough : null,
      sound: saved.sound === true,
    };
  } catch {
    return newSession();
  }
}

function readScreen(): Screen {
  const screen = location.hash.slice(1);
  return Object.hasOwn(screenNames, screen) ? screen as Screen : "week";
}

let session = loadSession();
let screen = readScreen();
let notesOpen = false;
let liveMessage = "";
let audio: AudioContext | undefined;

function saveSession() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(session));
  } catch {
    // The episode remains playable in memory when browser storage is unavailable.
  }
}

function stopCue() {
  const current = audio;
  audio = undefined;
  if (current && current.state !== "closed") void current.close().catch(() => {});
}

async function cue() {
  if (!session.sound || !window.AudioContext || audio) return;
  try {
    const context = new AudioContext();
    audio = context;
    await context.resume();
    if (audio !== context) return;
    const start = context.currentTime;
    for (const [index, frequency] of [523.25, 783.99].entries()) {
      const time = start + index * 0.075;
      const note = context.createOscillator();
      const gain = context.createGain();
      note.type = "sine";
      note.frequency.value = frequency;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.06, time + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.27);
      note.connect(gain).connect(context.destination);
      if (index === 1) note.onended = () => { if (audio === context) stopCue(); };
      note.start(time);
      note.stop(time + 0.28);
    }
  } catch {
    stopCue();
    // Audio is optional and all cues have a visible equivalent.
  }
}

const arrow = '<span aria-hidden="true">→</span>';
const openDossier = (name: "ivy" | "vera", label: string) =>
  `<button type="button" class="text-button" data-action="profile-${name}">${label} ${arrow}</button>`;

function metric(label: string, value: string, detail = "") {
  return `<div class="metric"><dt>${label}</dt><dd><strong>${value}</strong>${detail ? `<small>${detail}</small>` : ""}</dd></div>`;
}

function weekScreen() {
  const played = session.phase === "revealed";
  return `
    <section class="episode-cover">
      <img class="stage-art" src="${stage}" alt="" width="1080" height="2340">
      <div class="cover-copy">
        <p class="eyebrow gold">${played ? "NEXT CHAPTER" : "SATURDAY NIGHT · WEEK 4"}</p>
        <h1 id="screen-title" tabindex="-1">${played ? "The next move." : "The first defence."}</h1>
        <p>${played ? "The result is in the books. Decide what it means for the next premium event."
          : "One week after Ivy Knox won her first title, Vera Night wants another shot."}</p>
      </div>
      <img class="cover-belt" src="${belt}" alt="" width="800" height="360">
      <div class="cover-footer"><span>${episode.venue}</span><span>${episode.airing}</span></div>
    </section>
    <section class="decision panel">
      <div class="article-heading">
        <div>
          <p class="eyebrow">THE BOOKING DECISION</p>
          <h2>${played ? "Make the result count" : "When does Vera get her shot?"}</h2>
        </div>
      </div>
      <p>${played ? previewResolution(session.draft).next
        : "Coastline is on at the same time. A title match can win the slot now, or you can save the rematch for the premium event."}</p>
      <a class="button primary" href="#${played ? "season" : session.phase === "ready" ? "show" : "card"}">
        ${played ? "Decide the next chapter" : session.phase === "ready" ? "Go to ringside" : "Book the closing segment"} ${arrow}
      </a>
    </section>
    <section class="week-notes">
      <div class="note-item">
        <p class="eyebrow">LAST WEEK AT FOUNDRY HALL</p>
        <h2>Ivy won the belt.</h2>
        <p>${count.format(episode.previous.ppvBuys)} estimated PPV buys · ${count.format(episode.previous.attendance)} in the building.</p>
        ${openDossier("ivy", "See Ivy’s dossier")}
      </div>
      <div class="note-item quiet">
        <p class="eyebrow">ELSEWHERE ON SATURDAY</p>
        <h2>${played ? "Coastline’s next move." : "Coastline is counterprogramming."}</h2>
        <p>${played ? previewResolution(session.draft).rivalNext : "It plans to keep the slot if its feature show wins the audience."}</p>
      </div>
    </section>`;
}

function optionCard(key: Plan, locked: boolean) {
  const plan = plans[key];
  return `
    <label class="plan-option">
      <input type="radio" name="plan" value="${key}" ${session.draft.plan === key ? "checked" : ""} ${locked ? "disabled" : ""}>
      <span class="plan-copy"><strong>${plan.title}</strong><small>${plan.description}</small></span>
      <span class="cost">${dollars.format(plan.showCost)}</span>
    </label>`;
}

const moveButton = (segment: Segment, direction: "up" | "down", disabled: boolean, label: string) =>
  `<button type="button" class="icon-button" data-action="move-${segment}-${direction}" aria-label="Move ${label} ${direction}" ${disabled ? "disabled" : ""}>${direction === "up" ? "↑" : "↓"}</button>`;

function cardScreen() {
  const { draft, phase } = session;
  const locked = phase !== "open";
  const plan = plans[draft.plan];
  const orderedClosing = draft.order.at(-1) === "closing";
  return `
    <header class="screen-heading">
      <p class="eyebrow gold">${episode.airing.toUpperCase()} · ${episode.venue.toUpperCase()}</p>
      <h1 id="screen-title" tabindex="-1">The run sheet.</h1>
      <p>${locked ? "The card is confirmed for this local episode." : "Your crew has prepared the first two segments. Decide how the night ends."}</p>
    </header>
    <section class="panel booking" aria-labelledby="booking-title">
      <fieldset>
        <legend id="booking-title">Close the show</legend>
        <div class="plan-stack">${optionCard("defence", locked)}${optionCard("hold", locked)}</div>
      </fieldset>
      <div class="forecast" aria-label="Projected implications">
        <span><strong>${airtime(draft)} min</strong> booked airtime</span>
        <span><strong>${dollars.format(plan.showCost)}</strong> projected event cost</span>
      </div>
      ${!orderedClosing ? '<p class="warning">The featured segment is out of the closing slot. The fixture applies a pacing penalty.</p>' : ""}
      <details class="controls" ${notesOpen ? "open" : ""}>
        <summary>Script and running order</summary>
        ${draft.plan === "defence" ? `<label class="finish-label">Scripted finish
          <select name="finish" ${locked ? "disabled" : ""}>
            ${Object.entries(finishes).map(([key, label]) =>
              `<option value="${key}" ${draft.finish === key ? "selected" : ""}>${label}</option>`).join("")}
          </select></label>` : ""}
        <ol class="run-sheet">
          ${draft.order.map((segment, index) => {
            const item = segmentDetails(segment, draft);
            return `<li class="run-row">
              <div><strong>${item.title}</strong><small>${item.duration} min · ${item.note}</small></div>
              <div class="move-controls">
                ${moveButton(segment, "up", locked || index === 0, item.title)}
                ${moveButton(segment, "down", locked || index === draft.order.length - 1, item.title)}
              </div>
            </li>`;
          }).join("")}
        </ol>
      </details>
    </section>
    <aside class="crew-note">
      <span class="initials" aria-hidden="true">FM</span>
      <div><p class="eyebrow">FELIX MERCADO · ROAD AGENT</p>
      <p>${draft.plan === "defence"
        ? "The crowd will buy a second match if Vera makes Ivy work for it. Give the finish time to breathe."
        : "Let Vera challenge Ivy on camera. If you put it on the show, expect her to call you on it later."}</p></div>
    </aside>
    <div class="actions">
      ${locked ? `<a href="#show" class="button primary">${phase === "ready" ? "Go to ringside" : "Read the result"} ${arrow}</a>`
        : `<button type="button" class="button primary" data-action="confirm">Confirm this episode ${arrow}</button>`}
    </div>`;
}

function showScreen() {
  if (session.phase === "open") return `
    <header class="screen-heading"><p class="eyebrow gold">RINGSIDE</p><h1 id="screen-title" tabindex="-1">Before the bell.</h1>
    <p>Confirm a card to turn the lights on at Foundry Hall.</p></header>
    <a href="#card" class="button primary">Open the run sheet ${arrow}</a>`;
  if (session.phase === "ready") return `
    <section class="arena darkroom">
      <img class="stage-art" src="${stage}" alt="" width="1080" height="2340">
      <div class="ring-marker"><span></span><span></span><span></span></div>
      <p class="eyebrow gold">${episode.promotion.toUpperCase()} · WEEK 4</p>
      <h1 id="screen-title" tabindex="-1">Foundry Hall.</h1>
      <p>${session.draft.plan === "defence"
        ? "The belt is at ringside. Ivy and Vera are waiting at the curtain."
        : "Vera has the microphone. The whole building knows who she came to call out."}</p>
      <div class="arena-actions">
        <button type="button" class="button primary" data-action="reveal">Ring the bell ${arrow}</button>
        <button type="button" class="text-button plain" data-action="skip-reveal">Skip to the result</button>
      </div>
    </section>`;
  const result = previewResolution(session.draft);
  return `
    <section class="arena aftermath darkroom">
      <img class="stage-art" src="${stage}" alt="" width="1080" height="2340">
      ${result.plan === "defence" ? `<img class="hero-belt" src="${belt}" alt="" width="800" height="360">` : ""}
      <p class="eyebrow gold">${result.titleChange ? "TITLE CHANGE" : result.plan === "hold" ? "THE FINAL WORD" : "TITLE DEFENCE"}</p>
      <h1 id="screen-title" tabindex="-1">${result.headline}</h1>
      <p>${result.call}</p>
    </section>
    <section class="panel result-panel"><h2>After the bell</h2>
      <dl class="metrics">
        ${metric("TV rating", result.rating.toFixed(2), `vs ${result.rivalRating.toFixed(2)} Coastline`)}
        ${metric("Crowd", `${result.crowd}/100`, `${count.format(result.viewers)} estimated viewers`)}
      </dl>
      <p>${result.consequence}</p>
      <p class="rival-next">${result.rivalNext}</p>
      <a href="#season" class="button primary">Carry it into the season ${arrow}</a>
    </section>`;
}

function nextChapter(result: Resolution) {
  if (session.followThrough === "reserve") return result.titleChange
    ? "Ivy is booked to challenge Vera at the Week 6 premium event."
    : "Vera is booked to challenge Ivy at the Week 6 premium event.";
  return session.followThrough === "reassess"
    ? result.plan === "hold"
      ? "The slot stays open. Vera’s televised challenge remains unresolved."
      : "The title slot stays open. The next contender must earn it on television."
    : result.next;
}

function seasonScreen() {
  const result = session.phase === "revealed" ? previewResolution(session.draft) : null;
  const champion = result?.champion ?? episode.previous.champion;
  const challenger = champion === "Ivy Knox" ? "Vera" : "Ivy";
  return `
    <header class="screen-heading season-heading">
      <p class="eyebrow gold">${episode.promotion.toUpperCase()}</p>
      <h1 id="screen-title" tabindex="-1">The first reign.</h1>
      <p>The history of the Summit Women’s Championship, starting with Ivy’s first win.</p>
    </header>
    <section class="reign-card">
      <img src="${belt}" alt="" width="800" height="360">
      <div><p class="eyebrow">REIGNING CHAMPION</p><h2>${champion}</h2>
      ${openDossier(champion === "Ivy Knox" ? "ivy" : "vera", "Champion’s dossier")}</div>
    </section>
    <ol class="timeline">
      <li><span class="timeline-week">W3</span><div><h2>The first champion</h2><p>Ivy beat Vera at Summit Premium. The result opened the inaugural reign.</p></div></li>
      <li><span class="timeline-week">W4</span><div><h2>${result ? result.headline : "The next broadcast"}</h2>
      <p>${result ? result.consequence : "Two promotions share the slot. Vera wants her next chance."}</p></div></li>
      <li><span class="timeline-week future">W6</span><div><h2>Summit Premium</h2>
      <p>${result ? nextChapter(result) : "The next title match is still open."}</p></div></li>
    </ol>
    ${result ? `<section class="panel follow-through">
      <h2>${session.followThrough ? "Next chapter set" : "Choose the next challenger"}</h2>
      <p>${session.followThrough ? nextChapter(result) : result.plan === "hold"
        ? "Vera called for the Week 6 match on television. Reserving it follows through. Leaving the slot open keeps her challenge unresolved."
        : "Put the next title match on the schedule or let television decide who earns it."}</p>
      ${session.followThrough ? `<button type="button" class="text-button" data-action="reopen-follow">Change the next chapter</button>`
        : `<button type="button" class="button primary" data-action="reserve">Reserve ${challenger}’s title match ${arrow}</button>
           <button type="button" class="text-button" data-action="reassess">Keep the contender slot open</button>`}
    </section>` : `<a href="#${session.phase === "ready" ? "show" : "card"}" class="button primary">Continue Week 4 ${arrow}</a>`}`;
}

function profileDialog(person: "ivy" | "vera") {
  const isIvy = person === "ivy";
  const name = isIvy ? "Ivy Knox" : "Vera Night";
  const champion = session.phase === "revealed" ? previewResolution(session.draft).champion : "Ivy Knox";
  const goal = champion === name ? "Make the first title run count" : isIvy ? "Earn a path back to the championship" : "Get a clear shot at the belt";
  const dialog = document.createElement("dialog");
  dialog.className = "modal";
  dialog.setAttribute("aria-labelledby", "dossier-name");
  dialog.innerHTML = `
    <form method="dialog"><button class="icon-button close-modal" aria-label="Close dossier" autofocus>×</button></form>
    <p class="eyebrow gold">WRESTLER DOSSIER</p>
    <h2 id="dossier-name">${name}</h2>
    <p>${champion === name ? episode.title : "Title contender"} · Summit Pro Wrestling</p>
    <section class="dossier-goal"><h3>${goal}</h3><p>${isIvy
      ? "Wants the belt to be earned in the ring. A strong opponent makes the reign mean more."
      : "Wants a chance the audience can see. A public promise means more than a quiet reassurance."}</p></section>
    <p class="dossier-note">Last shared chapter · Ivy defeated Vera for the title at Summit Premium.</p>`;
  const trigger = document.activeElement;
  dialog.addEventListener("close", () => {
    dialog.remove();
    if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
  }, { once: true });
  document.body.append(dialog);
  dialog.showModal();
}

const views: Record<Screen, () => string> = { week: weekScreen, card: cardScreen, show: showScreen, season: seasonScreen };

function render(focus?: string) {
  app.innerHTML = `
    <div class="shell" data-screen="${screen}">
      <header class="topbar">
        <a href="#week" class="wordmark" aria-label="PPW, this week"><img src="${logo}" alt="" width="128" height="32"></a>
        <div class="edition">THE PROMOTER’S CUT<small>INTERACTION PROTOTYPE</small></div>
        <button type="button" class="sound" data-action="sound" aria-pressed="${session.sound}" aria-label="Sound">
          <span aria-hidden="true">${session.sound ? "Sound on" : "Sound off"}</span>
        </button>
      </header>
      <main id="main" tabindex="-1">${views[screen]()}</main>
      <footer class="prototype-note">
        <span>Local fixture · No World connection</span>
        <button type="button" class="text-button" data-action="reset">Restart episode</button>
      </footer>
      <nav class="navigation" aria-label="Prototype sections">
        ${Object.entries(screenNames).map(([id, label]) =>
          `<a href="#${id}" ${id === screen ? 'aria-current="page"' : ""}><span aria-hidden="true">${navIcons[id as Screen]}</span>${label}</a>`).join("")}
      </nav>
    </div>`;
  if (announcement.textContent !== liveMessage) announcement.textContent = liveMessage;
  if (focus === "title") document.querySelector<HTMLElement>("#screen-title")?.focus({ preventScroll: true });
  else if (focus) app.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true });
}

function go(next: Screen) {
  if (next === screen) {
    render("title");
    window.scrollTo(0, 0);
    return;
  }
  location.hash = next;
}

function moveSegment(segment: Segment, direction: "up" | "down") {
  const index = session.draft.order.indexOf(segment);
  const next = index + (direction === "up" ? -1 : 1);
  const order = [...session.draft.order];
  if (index === -1 || next < 0 || next >= order.length) return;
  [order[index], order[next]] = [order[next]!, order[index]!];
  session.draft.order = order;
  notesOpen = true;
  liveMessage = `${segmentDetails(segment, session.draft).title} moved to position ${next + 1}.`;
  saveSession();
  const kept = next > 0 && next < order.length - 1 ? direction : next === 0 ? "down" : "up";
  render(`[data-action="move-${segment}-${kept}"]`);
}

function onAction(action: string) {
  if (action === "profile-ivy" || action === "profile-vera") {
    profileDialog(action === "profile-ivy" ? "ivy" : "vera");
    return;
  }
  if (action === "sound") {
    session.sound = !session.sound;
    saveSession();
    if (session.sound) void cue();
    else stopCue();
    render('[data-action="sound"]');
    return;
  }
  if (action === "reset") {
    session = newSession(session.sound);
    notesOpen = false;
    liveMessage = "The episode was restarted.";
    saveSession();
    go("week");
    return;
  }
  if (action.startsWith("move-") && session.phase === "open") {
    const [, segment, direction] = action.split("-") as [string, Segment, "up" | "down"];
    moveSegment(segment, direction);
    return;
  }
  if (action === "confirm" && session.phase === "open") {
    session.phase = "ready";
    saveSession();
    go("show");
    return;
  }
  if ((action === "reveal" || action === "skip-reveal") && session.phase === "ready") {
    session.phase = "revealed";
    saveSession();
    if (action === "reveal") void cue();
    render("title");
    window.scrollTo(0, 0);
    return;
  }
  if (session.phase === "revealed" && (action === "reserve" || action === "reassess" || action === "reopen-follow")) {
    session.followThrough = action === "reopen-follow" ? null : action;
    liveMessage = action === "reopen-follow" ? "Next chapter reopened." : "Next chapter saved.";
    saveSession();
    render(action === "reopen-follow" ? '[data-action="reserve"]' : '[data-action="reopen-follow"]');
  }
}

app.addEventListener("click", event => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>("button[data-action]");
  if (button?.dataset.action) onAction(button.dataset.action);
});
app.addEventListener("change", event => {
  const field = event.target;
  if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement) || session.phase !== "open") return;
  notesOpen = app.querySelector("details.controls")?.hasAttribute("open") ?? false;
  if (field.name === "plan" && Object.hasOwn(plans, field.value)) {
    session.draft.plan = field.value as Plan;
    liveMessage = `${plans[session.draft.plan].title}, ${airtime(session.draft)} minutes booked airtime.`;
    saveSession();
    render(`input[name="plan"][value="${session.draft.plan}"]`);
  } else if (field.name === "finish" && Object.hasOwn(finishes, field.value)) {
    session.draft.finish = field.value as Finish;
    saveSession();
    render('select[name="finish"]');
  }
});
window.addEventListener("hashchange", () => {
  if (location.hash === "#main") {
    document.querySelector<HTMLElement>("#main")?.focus();
    return;
  }
  screen = readScreen();
  liveMessage = "";
  render("title");
  window.scrollTo(0, 0);
});
render();
