# Herdr Lazygit panel

A Lazygit button for the [Herdr desktop app](https://herdr.dev). It sits in the window's top tab bar, next to Files and Changes. Clicking it opens the right-side panel with a live [lazygit](https://github.com/jesseduffield/lazygit) for the active space's git repo.

![Herdr with the Lazygit panel open](preview.png)

## Requirements

- Herdr desktop app for macOS (v0.1.11 tested)
- `lazygit` on your PATH (`brew install lazygit`)
- `git`, and `jq` for `uninstall.sh`

## Install

```sh
git clone https://github.com/omarkar101/herdr-lazygit
cd herdr-lazygit
./install.sh
```

The install copies two mod folders and one layout into `~/.config/herdr-app` (or `$HERDR_APP_HOME`), checks them with `herdr-app check`, and switches Herdr to the `lazygit` layout. Switch back any time with `ctrl-shift-l`.

The install never overwrites anything it did not put there. If a target already exists and is not from this mod, it stops and tells you which path to move.

## Use

1. Open a space on a git repo.
2. Click **Lazygit** in the tab bar. The right panel opens with lazygit for that repo.
3. The bar above lazygit shows the repo name. The `↻` button restarts lazygit.

Each space and repo gets its own lazygit, which keeps running when you switch spaces. When you quit lazygit (`q`), clicking the button again starts a new one.

If the space is not in a git repo, the bar says "Not a git repository" and no lazygit starts. Remote spaces (on another machine) show "Lazygit panel supports local spaces only".

## How it works

- **`mods/lazygit-tabs`** is a clone of Herdr's shipped `tabs` mod with one extra button. It always offers the Lazygit panel.
- **`layouts/lazygit.json`** is a clone of the `main` layout. Its right panel is wider (520 px) and has a `lazygit` page: a 30 px bar (`lazygit-panel`) over a terminal block (`lazygit-term`).
- **`mods/lazygit-panel`** is the controller. While the panel shows lazygit, it finds the repo with `git rev-parse --show-toplevel` and looks for a live core terminal labelled `herdr-lazygit.space` and `herdr-lazygit.repo`. If there is none, it starts `lazygit` with `hc run --bg` and those labels, then points the terminal block at it with `layout.set`. Terminals for spaces that no longer exist are killed.

## Limitations

- The layout is a copy of `main` at install time. It does not pick up later changes Herdr makes to `main`. Re-run `./install.sh` after updating Herdr to re-copy the tab bar, or change the layout by hand.
- The tab-bar mod is also a copy, so Herdr's tab bar changes are not picked up either.
- Local spaces only. Remote spaces are not supported.
- One lazygit per space and repo. Starts are limited to one per 3 seconds per space and repo, so a lazygit that exits at once (for example, if it is not installed) does not spawn in a loop.

## Uninstall

```sh
./uninstall.sh
```

This switches Herdr back to `main`, ends the lazygit terminals the panel started, and removes the two mod folders and the layout. It removes only files marked as installed by this mod.
