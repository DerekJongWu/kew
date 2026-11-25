# Installing Kew

Kew is a Mac app for VC investors. It keeps your deals, people and notes in a folder on your Mac.

## What you need

- A Mac running macOS 13 (Ventura) or later.
- To pick the right download, click the Apple menu, then **About This Mac**.
  - If it says **Chip: Apple M1** (or M2, M3, M4), download `Kew-1.0.0-arm64.dmg`.
  - If it says **Processor: Intel**, download `Kew-1.0.0-x64.dmg`.

## Install

1. Open the `.dmg` file you downloaded. A window opens with the Kew icon and an Applications folder.
2. Drag **Kew** onto **Applications**.
3. Close the window. In Finder, eject the Kew disk (the small eject button next to it in the sidebar).

## Open it for the first time

Kew is not yet signed with an Apple developer certificate, so macOS blocks it the first time. You only do this once.

1. Open **Kew** from Applications. A message says it can't be opened. Click **Done** (or **OK**).
2. Open **System Settings**, then **Privacy & Security**.
3. Scroll down to the **Security** section. You will see "Kew was blocked to protect your Mac."
4. Click **Open Anyway**, then enter your Mac password or use Touch ID.
5. A last message asks if you're sure. Click **Open Anyway** again.

From now on Kew opens like any other app.

## Your first minute

Kew asks how you want to start.

- **Try the sample vault** fills a folder with made-up companies and people, so you can look around. It is safe to play with.
- **Start my vault** creates a new, empty vault for your own work.

## Where your data lives

- Your notes are plain text (markdown) files in your vault folder: `Documents/Kew Sample` for the sample, `Documents/Kew` for your own vault. You can open them in any text editor or in Obsidian.
- The app's own settings and a search index are in `~/Library/Application Support/Kew`. Kew can rebuild the index at any time.
- Nothing leaves your Mac. Kew does not connect to the internet.

## Uninstall

1. Quit Kew.
2. Drag **Kew** from Applications to the Trash.
3. Optional: to also remove the app's settings, delete the `Kew` folder in `~/Library/Application Support`. (In Finder, choose **Go**, then **Go to Folder**, and paste that path.)

Your vault folder is never touched. Delete it yourself if you want it gone.
