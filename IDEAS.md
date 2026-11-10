# Ideas

- 2026-11-10 · Locked-cursor "d-pad" mode for mouse/trackpad: lock the pointer, slide left/right to pick a tray piece, hold and move to push it relatively, and the next piece is selected at once after each drop, so you never drag the cursor back down. **Take:** strong; it removes the most tiring part of mouse play. The browser side is easy (Pointer Lock API). The Mac app is the risk: it needs UIKit pointer lock plus GameController mouse deltas, which haven't been tried in an iPad-on-Mac app. Esc must always free the pointer.
