---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-22
branch: main
title: Split and Route understand picture requests
---
## Fixed
- Split put a picture request ("generate about 30 images of Wizra in a variety of poses...") all in the code box: picture words (image, images, picture, pose, render...) now go to the art side, and a pictures-only request is not offered as a split
- Route it sent that request to 3D Meshy: "images of", "pictures", "renders" now go to Images (Wizra's real model when she is named)

## Tested
- That request: split puts it on the art side, Route it picks Images: Wizra's real model; photo-to-3D still Meshy; 44 checks pass

## Open
- The Brenai renderer only makes front and back views; a batch of many poses would reuse the picture pack's shot list (brenai/tools/picpack/shots2.cjs)
