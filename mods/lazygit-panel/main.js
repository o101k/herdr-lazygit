// Lazygit panel: a bar, and a live lazygit terminal for the active space's git repo.
import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, focused, exec, run, theme, layout, terminals, shared, home } from "herdr";

const TERM = "lazygit-term"; // the layout block that shows the terminal
const LABEL_SPACE = "herdr-lazygit.space";
const LABEL_REPO = "herdr-lazygit.repo";
const SYNC_MS = 16; // a terminal write waits this long, so it never overwrites the tab bar's restore
const RETRY_MS = 3000; // at most one (re)start per space + repo this often
const stop = (_e, cx) => cx.stop_propagation();

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

function parentOf(node, id) {
  for (const child of node?.children ?? []) {
    if (child.id === id) return node;
    const found = parentOf(child, id);
    if (found) return found;
  }
  return null;
}

// Where lazygit opens: the focused pane's folder when it is in this space, else the space's first
// pane with a folder, else the space's own folder.
function folderOf(space) {
  const f = focused();
  if (f?.space === space.id && f.cwd) return f.cwd;
  const tabs = new Set(space.tabs.map((t) => t.id));
  return panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || space.folder || home();
}

// The terminal block already shows `address` (or is hidden when `address` is null).
const matches = (node, address) => !node || (address ? !node.hidden && node.content?.terminal === address : !!node.hidden);

const lastPart = (path) => path.replace(/\/+$/, "").split("/").pop() || path;

export default class LazygitPanel extends View {
  init() {
    this.key = null; // space id + folder last seen
    this.roots = new Map(); // folder -> repo root, or null when not a repo (what git last said)
    this.resolving = new Set(); // folders git is being asked about
    this.terms = {}; // space id + repo root -> { address, at }
    this.view = null; // what the bar shows
    this.starting = false; // a start or restart is in flight
    this.cleaning = false; // a stale-terminal cleanup is in flight
    this.error = null;
    this.retry = null; // pending retry timer
    this.set = null; // { json, from, at } of the last terminal write, while it may not have landed
    this.want = null; // { spaceId, address }: what the terminal block should show
    this.syncing = null; // the pending terminal write
  }

  render(cx) {
    const t = theme();
    const root = layout();
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const space = spaces().find((s) => s.active);
    // The app drops a shown terminal block when its terminal ends, and with it the panel column
    // around the stack. Without the column the stack is still shown; put the layout back first.
    const onLazygit = !!body && body.active === "lazygit" && shared("layout") === "lazygit";
    if (onLazygit && !panel) this.heal(root);
    const showing = onLazygit && (!panel || !panel.hidden);
    if (space && showing) this.work(space, root, cx);
    return this.bar(t, cx);
  }

  // Puts back what the app removed: the panel column around the stack, and the terminal block on the lazygit page.
  heal(root) {
    const next = JSON.parse(JSON.stringify(root));
    const body = find(next, "panel-body"), parent = parentOf(next, "panel-body");
    if (parent && !find(next, "panel")) {
      const size = body.size ?? { px: 520 };
      delete body.size;
      parent.children[parent.children.indexOf(body)] = { id: "panel", type: "column", size, min: 280, max: 900, children: [body] };
    }
    const page = find(next, "lazygit");
    if (page && !find(next, TERM)) page.children.push({ id: TERM, type: "block", hidden: true, content: { terminal: "none" } });
    const json = JSON.stringify(next);
    if (this.healed?.json === json && Date.now() - this.healed.at < 2000) return;
    this.healed = { json, at: Date.now() };
    run("layout.set", { layout: next });
  }

  // Runs only while the panel shows lazygit. Decides what the bar says and which terminal the block shows.
  work(space, root, cx) {
    this.cleanup(cx);
    if (space.machine) {
      this.view = { kind: "remote" };
      return this.syncTerm(space.id, null, cx);
    }
    const folder = folderOf(space);
    const key = `${space.id}\n${folder}`;
    // A known folder is shown at once from the cache; git checks it again in the background.
    if (this.key !== key) {
      this.key = key;
      this.resolve(folder, cx);
    }
    const repo = this.roots.get(folder);
    if (repo === undefined) {
      // First look at this folder: show this space's lazygit if it has one, and never another space's.
      this.view = { kind: "checking", folder };
      const live = terminals().find((x) => x.state === "live" && x.labels?.[LABEL_SPACE] === space.id);
      return this.syncTerm(space.id, live?.address ?? null, cx);
    }
    if (!repo) {
      this.view = { kind: "norepo", folder };
      return this.syncTerm(space.id, null, cx);
    }
    const tkey = `${space.id}\n${repo}`;
    const address = this.addressFor(space.id, repo, tkey, cx);
    this.view = { kind: "repo", repo, space: space.id, tkey, address };
    this.syncTerm(space.id, address, cx);
  }

  resolve(folder, cx) {
    if (this.resolving.has(folder)) return;
    this.resolving.add(folder);
    cx.spawn(async (cx) => {
      const r = await exec("git", ["-C", folder, "rev-parse", "--show-toplevel"]).catch(() => null);
      const repo = r?.code === 0 ? r.stdout.trim() || null : null;
      this.resolving.delete(folder);
      if (this.roots.get(folder) === repo) return;
      this.roots.set(folder, repo);
      cx.notify();
    });
  }

  // The live lazygit for this space and repo: found by labels, else the one we started, else a new one.
  addressFor(spaceId, repo, tkey, cx) {
    const all = terminals();
    const live = all.find((x) => x.state === "live" && x.labels?.[LABEL_SPACE] === spaceId && x.labels?.[LABEL_REPO] === repo);
    if (live) return live.address;
    if (this.starting) return null;
    const rec = this.terms[tkey];
    if (rec?.address && all.find((x) => x.address === rec.address)?.state === "live") return rec.address;
    // Finished (the person quit lazygit), gone, or never started: start one, at most once per RETRY_MS.
    const wait = rec ? RETRY_MS - (Date.now() - rec.at) : 0;
    if (wait > 0) {
      if (!this.retry) {
        this.retry = cx.timer.after(wait + 50, (cx) => {
          this.retry = null;
          cx.notify();
        });
      }
      return null;
    }
    this.start(spaceId, repo, tkey, rec?.address ?? null, cx);
    return null;
  }

  // Starts a lazygit for a space and repo. `old` (if any) is killed and removed first.
  start(spaceId, repo, tkey, old, cx) {
    this.starting = true;
    this.terms[tkey] = { address: null, at: Date.now() };
    cx.spawn(async (cx) => {
      try {
        if (old) {
          await exec("hc", ["kill", old]).catch(() => null);
          await exec("hc", ["rm", old]).catch(() => null);
        }
        const r = await exec("hc", ["run", "--bg", "--json", "--no-parent", "--cwd", repo, "--label", `${LABEL_SPACE}=${spaceId}`, "--label", `${LABEL_REPO}=${repo}`, "--", "lazygit"]);
        const address = r.code === 0 ? JSON.parse(r.stdout).address : null;
        if (!address) throw new Error(r.stderr?.trim() || `hc exited with ${r.code}`);
        this.terms[tkey] = { address, at: Date.now() };
        this.error = null;
      } catch (e) {
        this.error = String(e?.message ?? e);
      } finally {
        this.starting = false;
        cx.notify();
      }
    });
  }

  restart(cx) {
    const v = this.view;
    if (v?.kind !== "repo" || this.starting) return;
    this.start(v.space, v.repo, v.tkey, v.address, cx);
  }

  // Kills and removes lazygit terminals whose space is gone.
  cleanup(cx) {
    const ids = new Set(spaces().map((s) => s.id));
    if (this.cleaning || !ids.size) return;
    const stale = terminals().filter((x) => x.state === "live" && x.labels?.[LABEL_SPACE] && !ids.has(x.labels[LABEL_SPACE]));
    if (!stale.length) return;
    this.cleaning = true;
    cx.spawn(async (cx) => {
      try {
        for (const x of stale) {
          await exec("hc", ["kill", x.address]).catch(() => null);
          await exec("hc", ["rm", x.address]).catch(() => null);
        }
      } finally {
        this.cleaning = false;
        cx.notify();
      }
    });
  }

  // Makes the layout's terminal block show `address`, or hide it when `address` is null.
  // layout.set replaces the whole tree, so the write waits a moment and is built from a fresh layout():
  // on a space switch Herdr's tab bar restores that space's panel in the same frame, and a tree read
  // before its restore landed would undo it. The write is dropped if the space or page changed meanwhile.
  syncTerm(spaceId, address, cx) {
    this.want = { spaceId, address };
    if (this.syncing || matches(find(layout(), TERM), address)) return;
    this.syncing = cx.timer.after(SYNC_MS, (cx) => {
      this.syncing = null;
      const { spaceId, address } = this.want ?? {};
      const root = layout();
      const panel = find(root, "panel"), body = find(root, "panel-body"), node = find(root, TERM);
      if (!node || shared("layout") !== "lazygit") return;
      if (spaces().find((s) => s.active)?.id !== spaceId) return;
      if (body?.active !== "lazygit" || panel?.hidden) return;
      this.writeTerm(root, node, address);
    });
  }

  // Writes the layout only when the terminal block differs from what is wanted.
  writeTerm(root, node, address) {
    if (matches(node, address)) return;
    const hidden = !address;
    // Skip only a repeat of a write that hasn't landed yet. Once the node has changed since, write
    // again at once, so quick A -> B -> A switches never leave B's terminal on screen.
    const json = JSON.stringify([address, hidden]);
    const from = JSON.stringify(node);
    if (this.set?.json === json && this.set.from === from && Date.now() - this.set.at < 2000) return;
    this.set = { json, from, at: Date.now() };
    const next = JSON.parse(JSON.stringify(root));
    const n = find(next, TERM);
    n.hidden = hidden;
    if (!hidden) n.content = { terminal: address };
    run("layout.set", { layout: next });
  }

  bar(t, cx) {
    const v = this.view ?? { kind: "checking" };
    const row = h_flex().id("lazygit-bar").size_full().min_w(0).px(10).gap(6).items_center()
      .bg(t.chrome).border_b(1).border_color(t.border).text_size(12);
    const head = (el) => el
      .child(svg("mods/lazygit-button/lazygit.svg").size(14).flex_none().text_color(t.muted))
      .child(div().flex_none().text_color(t.foreground).child("Lazygit"));
    if (v.kind === "repo") {
      const restart = div().id("lazygit-restart").size(22).flex_none().flex().items_center().justify_center().rounded(6)
        .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_mouse_down("left", stop).on_click((_e, cx) => this.restart(cx)).child("↻");
      const label = this.error && !v.address ? `Could not start lazygit: ${this.error}` : lastPart(v.repo);
      return head(row).child(div().flex_1().min_w(0).truncate().text_color(this.error && !v.address ? t.blocked : t.muted).child(label)).child(restart);
    }
    const text = v.kind === "remote" ? "Lazygit panel supports local spaces only"
      : v.kind === "norepo" ? `Not a git repository: ${v.folder}`
      : "Checking repository…";
    return head(row).child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(text));
  }
}
