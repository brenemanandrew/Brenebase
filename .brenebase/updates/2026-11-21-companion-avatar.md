---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-21
branch: main
title: Companion tab with an avatar set up on first use; voice reads only what a person would say
---
## Done
- Companion tab: multi-turn chat on the PC model only (last 24 lines as real turns), modes Just talk, Vent, Roleplay, Coach, voice input, new conversation
- First-use setup: name, seven colours with live preview, voice, about note, read replies aloud; Edit look later; tab takes its name
- Avatar: Brenai's cartoon puppet (avatar.js) with settable colours; mood from replies, gestures from actions, mouth follows the voice
- speakable(): the voice skips code, links, paths, tables, JSON, actions and formatting; nothing speakable means no voice job; capped at about 1500 characters

## Tested
- 42 checks pass (3 new for the voice filter)
- Phone-size browser with a stand-in PC model: setup with custom hair and top colours, save, Vent message, reply shown, angry face on the avatar, tab renamed
- Fixed: chat avatar lost its background while the hidden setup preview kept a duplicate drawing

## Not tested
- The real PC model and Kokoro on Andrew's PC, mouth sync on his phone
