// Lazygit button: sits beside Herdr's own tab bar and opens or closes the Lazygit page of the right panel.
// It remembers, per space, whether that page was open, because Herdr's tabs only remember Files and Changes.
import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, run, theme, layout } from "herdr";

const KEY = "open"; // localStorage: { [spaceId]: true | false }
const RESTORE_MS = 300; // after a switch to a space that had Lazygit open: after Herdr's tabs restored its own panel
const SETTLE_MS = 1200; // after a switch: before this space's state is recorded (Herdr's restore is done by then)
const stop = (_e, cx) => cx.stop_propagation();

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

function save(memory) {
  const ids = new Set(spaces().map((s) => s.id));
  for (const id of Object.keys(memory)) if (!ids.has(id)) delete memory[id];
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    // Browser storage can be unavailable; the button still works, it just forgets.
  }
}

// The Lazygit page is open: the panel shows the lazygit child of its stack.
function lazygitShown(root) {
  const panel = find(root, "panel"), body = find(root, "panel-body");
  return !!body && body.active === "lazygit" && (!panel || !panel.hidden);
}

export default class LazygitButton extends View {
  init() {
    this.space = null; // the active space last seen
    this.settled = false; // this space's restore is done, so its state may be recorded
    this.timer = null;
  }

  render(cx) {
    const t = theme();
    const on = lazygitShown(layout());
    const space = spaces().find((s) => s.active);
    if (space) this.follow(space, on, cx);
    return h_flex().size_full().pl(3).pr(10).items_center().bg(t.chrome).border_b(1).border_color(t.border).child(
      h_flex().id("lazygit-open").h(26).px(8).gap(5).flex_none().items_center().rounded(6).text_size(12)
        .bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted).hover((s) => s.bg(t.hover))
        .on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else {
            run("layout.select", { stack: "panel-body", child: "lazygit" });
            run("layout.show", { id: "panel" });
          }
        })
        .child(svg("mods/lazygit-button/lazygit.svg").size(14))
        .child("Lazygit"));
  }

  // Switching spaces: if this space had Lazygit open, show it again once Herdr's tabs have restored
  // the panel. Otherwise leave the panel to Herdr. Record a space's state only after it has settled.
  follow(space, on, cx) {
    if (space.id !== this.space) {
      this.space = space.id;
      this.settled = false;
      this.timer?.cancel();
      const id = space.id;
      const remembered = load()[id] === true;
      this.timer = cx.timer.after(remembered ? RESTORE_MS : 1, (cx) => {
        const active = () => spaces().find((s) => s.active)?.id;
        if (active() !== id) {
          this.timer = null;
          return;
        }
        if (remembered && !lazygitShown(layout())) {
          run("layout.select", { stack: "panel-body", child: "lazygit" });
          run("layout.show", { id: "panel" });
        }
        this.timer = cx.timer.after(SETTLE_MS, (cx) => {
          this.timer = null;
          if (active() === id) {
            this.settled = true;
            cx.notify();
          }
        });
      });
    }
    if (this.settled && space.id === this.space) {
      const memory = load();
      if (memory[space.id] !== on) {
        memory[space.id] = on;
        save(memory);
      }
    }
  }
}
