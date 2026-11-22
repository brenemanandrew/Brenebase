---
name: wow-addon
description: Build or fix World of Warcraft addons in Lua, in particular Andrew's SUI addon in his WoW AddOns folder: the .toc file, frames and events, saved variables, slash commands, bag and unit frames, and avoiding taint in combat. Use when a request is about SUI, a WoW addon, a WoW UI frame or a Lua error from the game. Not for Breneland or other web games.
---

# WoW addon (SUI)

SUI lives in `C:\Program Files (x86)\World of Warcraft\_retail_\Interface\AddOns\SUI` on Andrew's PC. Changes can only be tried in the game on his PC.

## The parts
- `SUI.toc`: `## Interface:` (the game version number; update it when the patch changes), `## Title`, `## Notes`, `## Version`, `## SavedVariables` (account-wide) and `## SavedVariablesPerCharacter`, then the .lua and .xml files in load order.
- Lua: one table for the addon (`local addonName, ns = ...`), `CreateFrame` for frames, `frame:RegisterEvent` and an `OnEvent` handler (`ADDON_LOADED` for settings, `PLAYER_LOGIN` to build the UI).
- Saved variables are only filled after `ADDON_LOADED` for this addon; set defaults there, never at file load.
- Slash command: `SLASH_SUI1 = "/sui"` and `SlashCmdList.SUI = function(msg) ... end`.

## Rules
- Never move, show or hide protected frames in combat: check `InCombatLockdown()` and defer to `PLAYER_REGEN_ENABLED`. Use secure templates for anything clickable that casts or targets.
- Use the current API names (`C_Container`, `C_Item` and so on); old globals were removed in recent patches.
- Keep settings backward compatible: add new keys with defaults, never rename.
- Back up the addon folder before changing it (copy to `SUI.bak-<date>`).

## How to verify
- In game: `/reload`, then use the feature. Lua errors show with BugSack and BugGrabber, or `/console scriptErrors 1`.
- Outside the game only syntax can be checked (`luac -p` if installed). Say plainly that it was not tried in game until Andrew tries it.

## Report
Files changed, what to try in game and how (`/reload`, which slash command), and what was not tested.
