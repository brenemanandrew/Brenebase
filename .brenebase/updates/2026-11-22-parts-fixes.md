---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-22
branch: main
title: Add-ons stay with their request; parts cards follow their parts
---
## Fixed
- "a lighthouse at sunset, 2 images" was split into two parts; add-ons ("2 images", "16:9", "in anime style") now stay with the request before them, and each part is routed again on its whole text (now Images: Realistic, Z-Image Turbo)
- A parts card said done and "Answered" while a part was still running; it now shows running until all parts finish, lists each part and its status in the report, and shows the parts underneath

## Tested
- 48 checks pass (1 new)
