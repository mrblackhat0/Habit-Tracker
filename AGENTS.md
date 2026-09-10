# Global Rules & Preferences

## 🔔 Termux Notification Requirement
- **Rule**: Send a system notification using the Termux API (`termux-notification`) with a fixed ID (`--id "opencode"`) in these cases ONLY:
  1. Upon task completion (always)
  2. Before asking for permission to use any tool or bash command that is **not allowed** (`permission: ask`) — send the notification *before* the permission request. Do **not** send notifications for actions whose permissions are already `allow` locally or globally (per `opencode.json`).
- **Command**:
  ```bash
  termux-notification --id "opencode" --title "Opencode Assistant" --content "<Message details>"
  ```
