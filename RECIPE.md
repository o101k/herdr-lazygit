# Lazygit panel

A Lazygit button in the top tab bar, next to Files and Changes. Clicking it opens the right-side panel with a live lazygit terminal for the active space's git repo. A thin bar above the terminal shows the repo name and a restart button.

![Lazygit panel](preview.png)

## What you see

- **Tab bar** (top, 42 px, `chrome` background): the usual space tabs on the left, then `+`, then three panel buttons on the right: **Files**, **Changes**, and **Lazygit** (a one-color git-branch icon, label "Lazygit", 26 px tall, 12 px text). The active panel's button uses the `selected` background.
- **Main area**: the terminal of the active tab, as in the default `main` layout.
- **Right panel** (520 px wide, hidden by default, 280 to 900 px): a 30 px bar on top, then a live lazygit terminal that fills the rest.
- **The bar**: a git-branch icon (14 px, `muted`), "Lazygit" in `foreground`, then the repo folder's name in `muted` at 12 px, then a 22 px `↻` button at the right.
- **Non-repo or remote space**: the bar shows the same icon and label, then muted text: "Not a git repository: <folder>" or "Lazygit panel supports local spaces only". The terminal area is empty.

## How it behaves

- Opening the Lazygit panel for a space runs `git rev-parse --show-toplevel` in that space's folder. The folder is the focused pane's folder if it is in this space, else the first pane's folder, else the space's folder.
- If the folder is in a repo and no live lazygit exists for that space and repo, the mod starts `lazygit` in the repo root. The bar then shows the repo name and the terminal shows lazygit's own UI (Status, Files, Branches, Commits, Stash).
- Switching spaces shows that space's lazygit. Each space and repo keeps its own lazygit running.
- Quitting lazygit with `q` ends it. The next time the panel is evaluated, a new one starts. The bar stays on screen.
- Clicking `↻` kills the current lazygit and starts a fresh one. The button does nothing while a start is in progress.
- Closing a space kills its lazygit the next time the panel is shown.
- Clicking **Lazygit** again, or **Files** / **Changes**, switches the panel's page. Clicking the active button closes the panel.
- Nothing else in the window changes: other spaces, tabs and terminals are untouched.

## Built from

- **Layout `lazygit`** (`layouts/lazygit.json`): a copy of the shipped `main` layout, with three changes. The `tabs` block uses the mod `lazygit-tabs`. The `panel` column is 520 px. The `panel-body` stack gets a third child, `lazygit`: a column with a 30 px block (`lazygit-bar`, mod `lazygit-panel`) and a hidden block (`lazygit-term`) with content `{ "terminal": "none" }` that the controller fills.
- **Mod `lazygit-tabs`**: a copy of the shipped `tabs` mod. Its `enabled` list always includes `lazygit`. It adds a Lazygit button with `panelButton("lazygit", "Lazygit", "mods/lazygit-tabs/lazygit.svg")`. Icon: `lazygit.svg`, a Lucide-style git-branch in 24x24 with `currentColor` strokes.
- **Mod `lazygit-panel`** (controller): uses `spaces()`, `focused()`, `panes()`, `layout()`, `terminals()`, `shared("layout")`, `theme()`, `exec("git")`, `exec("hc")` and `run("layout.set")`.
- **Commands and programs**: `git rev-parse --show-toplevel`; `hc run --bg --json --no-parent --cwd <root> --label herdr-lazygit.space=<id> --label herdr-lazygit.repo=<root> -- lazygit`; `hc kill`, `hc rm`.
- **Shipped mods used**: `mods/files/file.svg`, `mods/changes/changes.svg`, `mods/pane/close.svg`, `mods/workspace-chrome/spinner.svg` (from the tabs mod), and the `tabs` mod's window-button icons, copied into `mods/lazygit-tabs/`.

## Watch out

- **Don't add `herdr.space` or `herdr.tab` labels** to the lazygit terminal. Those make it a normal tab. Use only the `herdr-lazygit.*` labels.
- **Write the layout only when it changes.** The terminal block's address is written with `layout.set`, and only when the node differs from what is wanted. Writing on every render makes a loop.
- **Check for the shared layout name**: the controller writes the layout only when `shared("layout") === "lazygit"`. Do not write another layout.
- **A start can fail silently**: if `lazygit` is not on PATH, the terminal exits at once. The controller retries at most once every 3 seconds. The bar shows the error only when `hc` itself fails.
- **Keep `herdr-app check` passing** for both mods after any edit.
- **Herdr drops the terminal block when its terminal ends while shown**, along with the `panel` column around the stack (the stack moves up and keeps its 520 px). Find nodes by id and rebuild them when missing. Don't require `panel` to exist before showing lazygit.
- **Use `git -C <folder>`**, not `cd`: `exec` runs in the app's environment and the folder can change while the mod runs.
- **Don't make the bar draw a timer**: nothing polls. Everything reacts in `render`.
- **`hc ls --json` doesn't print labels.** Read them with `hc get <t> --json`, or filter with `hc ls --label k=v`.

## Done when

- `herdr-app check` passes for `mods/lazygit-tabs` and `mods/lazygit-panel`, and `herdr-app status` shows `"errors": []` after the layout is switched to `lazygit`.
- The tab bar shows Files, Changes and Lazygit in that order, and clicking Lazygit opens the right panel with lazygit's Status, Files, Branches and Commits boxes.
- For a space in a git repo, `hc ls --all --json --label herdr-lazygit.space=<id>` shows exactly one live lazygit terminal, and it stays one after 5 seconds.
- After `hc kill` of the panel's lazygit, within about 5 seconds a new live lazygit with the same labels is shown in the panel. Repeating the kill recovers again, and there is never more than one live lazygit for that space.
- For a space on `/tmp`, the bar reads "Not a git repository: /private/tmp" and no lazygit terminal exists for that space.
