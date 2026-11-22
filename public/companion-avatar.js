// Wizra's avatar: a small animated SVG puppet. No libraries.
//
// The page only talks to it through this interface, so the real VTuber avatar can replace it later by providing the
// same five calls:
//   const av = WizraAvatar.mount(stageElement)
//   av.setMood(name)       base mood: auto, happy, playful, chill, focused, excited, tired, grumpy, sad, anxious
//   av.setThinking(bool)   she is working on a reply
//   av.talk(level)         call while she is speaking; level 0..1 is how loud her voice is right now (optional)
//   av.feel(text)          her reply so far: picks a passing expression from her words and actions
//   av.setRenderer(r)    swap what draws her, live (the cartoon below, or the 3D model from avatar-vrm.js)
//   mount(el, { onTouch(kind) })  onTouch fires when she is touched directly (the page passes it on to her, silently)
//   av.act(text)           her finished reply: plays the first gesture found in her actions (wave, nod, shrug, stretch...)
//   av.react(kind, dir)    something was done to her: poke, boop, pat, pet, swat, body, spam, wave, laugh, stare, gift
// Touch on the avatar itself (tap, stroke, swipe) is handled in here and calls react().
(function () {
  /* Brenebase companion: the look comes from window.COMPANION_LOOK (set up the first time you talk to it). The puppet is
     Brenai's cartoon avatar (brenai/public/avatar.js) with its colours made settable. */
  /* the look: colours, hairstyle, clothes, body shape and bounce. Always dressed. */
  const DEF = { skin: '#f4ecef', hair: '#0b0b10', lip: '#4a1f3a', iris: '#3b2f4f', top: '#2a2234', shirt: '#e6dbe0', bottom: '#2b3550', shoes: '#1c1a22', bg1: '#8a5bb8', bg2: '#2a1b4d',
    hairStyle: 'long', topStyle: 'hoodie', bottomStyle: 'jeans', shoeStyle: 'boots', glasses: false, shoulders: 0.5, bust: 0.5, waist: 0.5, hips: 0.5, legs: 0.5, bounce: 0.5 };
  const LK = () => { const L = Object.assign({}, DEF, window.COMPANION_LOOK || {}); L.top2 = L.top; for (const k of ['shoulders', 'bust', 'waist', 'hips', 'legs', 'bounce']) L[k] = Math.max(0, Math.min(1, +L[k])); return L; };
  const INK = '#111';
  const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * f)))); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); };
  /* body measurements from the sliders (puppet space: head centre 100,96; feet near y 470) */
  const BODY = L => {
    const sh = 28 + L.shoulders * 10, bust = L.bust, w = 15 + L.waist * 9, h = 25 + L.hips * 13, leg = 0.92 + L.legs * 0.16;
    const hipY = 270, kneeY = hipY + 86 * leg, ankY = kneeY + 84 * leg;
    return { sh, bust, w, h, hipY, kneeY, ankY, footY: ankY + 12, crotchY: hipY + 20, chestY: 190, waistY: 236 };
  };
  const TOPS = { hoodie: { end: 280, sleeve: 'long', neck: 'hood' }, tee: { end: 270, sleeve: 'short', neck: 'crew' }, tank: { end: 266, sleeve: 'none', neck: 'scoop' }, sweater: { end: 284, sleeve: 'long', neck: 'high' }, blouse: { end: 268, sleeve: 'long', neck: 'v' }, crop: { end: 222, sleeve: 'short', neck: 'crew' }, dress: { end: 0, sleeve: 'short', neck: 'scoop' } };
  function torsoPath(B, end, pad = 0) {
    const s = B.sh + pad, cw = 22 + B.bust * 5 + pad, w = B.w + pad, h = B.h + pad;
    const yEnd = end, wy = B.waistY;
    const lx = t => 100 - t, rx = t => 100 + t;
    const hipAt = y => y <= wy ? w + (cw - w) * Math.max(0, (wy - y) / (wy - B.chestY)) : w + (h - w) * Math.min(1, (y - wy) / (B.hipY - wy));
    const e = hipAt(yEnd);
    return `M${lx(12 + pad)} 150 C${lx(s - 6)} 151 ${lx(s)} 154 ${lx(s)} 166 C${lx(s - 1)} 178 ${lx(cw)} ${B.chestY - 6} ${lx(cw)} ${B.chestY + 4} C${lx(cw)} ${wy - 22} ${lx(w)} ${wy - 14} ${lx(w)} ${Math.min(wy, yEnd)} ${yEnd > wy ? `C${lx(w)} ${wy + 12} ${lx(e)} ${yEnd - 16} ${lx(e)} ${yEnd}` : ''} L${rx(e)} ${yEnd} ${yEnd > wy ? `C${rx(e)} ${yEnd - 16} ${rx(w)} ${wy + 12} ${rx(w)} ${wy}` : `L${rx(w)} ${Math.min(wy, yEnd)}`} C${rx(w)} ${wy - 14} ${rx(cw)} ${wy - 22} ${rx(cw)} ${B.chestY + 4} C${rx(cw)} ${B.chestY - 6} ${rx(s - 1)} 178 ${rx(s)} 166 C${rx(s)} 154 ${rx(s - 6)} 151 ${rx(12 + pad)} 150 Z`;
  }
  function hairBack(L) {
    const c = L.hair, st = L.hairStyle;
    if (st === 'pixie') return '';
    if (st === 'bob') return `<path d="M40 112 C30 30 170 30 160 112 L164 148 C140 156 60 156 36 148 Z" fill="${c}"/>`;
    if (st === 'bun') return `<circle cx="100" cy="46" r="20" fill="${c}" stroke="${INK}" stroke-width="2"/><path d="M47 108 C37 34 163 34 153 108 C150 118 142 124 132 124 L68 124 C58 124 50 118 47 108 Z" fill="${c}"/>`;
    if (st === 'ponytail') return `<path d="M47 108 C37 34 163 34 153 108 C150 118 142 124 132 124 L68 124 C58 124 50 118 47 108 Z" fill="${c}"/><g data-p="tailR"><path d="M140 70 C176 76 178 150 160 222 C150 180 146 130 132 90 Z" fill="${c}" stroke="${INK}" stroke-width="2"/></g>`;
    if (st === 'twintails') return `<path d="M47 108 C37 34 163 34 153 108 C150 118 142 124 132 124 L68 124 C58 124 50 118 47 108 Z" fill="${c}"/><g data-p="tailL"><path d="M58 64 C20 78 16 160 34 230 C44 186 50 130 66 88 Z" fill="${c}" stroke="${INK}" stroke-width="2"/></g><g data-p="tailR"><path d="M142 64 C180 78 184 160 166 230 C156 186 150 130 134 88 Z" fill="${c}" stroke="${INK}" stroke-width="2"/></g>`;
    if (st === 'wavy') return `<path d="M38 114 C30 28 170 28 162 114 C170 150 158 170 168 200 C176 230 156 244 162 262 C140 270 60 270 38 262 C44 244 24 230 32 200 C42 170 30 150 38 114 Z" fill="${c}"/>`;
    return `<path d="M38 114 C30 28 170 28 162 114 L168 258 C140 266 60 266 32 258 Z" fill="${c}"/>`;   // long
  }
  function hairFront(L) {
    const c = L.hair;
    const cap = `<path d="M61 104 C52 30 148 30 139 104 C137 90 131 81 121 77 L115 84 L108 76 L100 84 L92 76 L85 84 L79 77 C69 81 63 90 61 104 Z" fill="${c}"/>`;
    if (L.hairStyle === 'pixie') return `<path d="M60 100 C52 34 148 34 140 100 C136 86 128 78 116 76 C104 82 86 74 76 80 C68 84 62 92 60 100 Z" fill="${c}"/>`;
    if (L.hairStyle === 'bob' || L.hairStyle === 'bun' || L.hairStyle === 'ponytail' || L.hairStyle === 'twintails') return cap + `<path d="M62 96 L59 128 L69 124 Z" fill="${c}"/><path d="M138 96 L141 128 L131 124 Z" fill="${c}"/>`;
    return cap + `<path d="M62 96 L57 138 L70 132 Z" fill="${c}"/><path d="M138 96 L143 138 L130 132 Z" fill="${c}"/>`;
  }
  function clothes(L, B) {
    const T = TOPS[L.topStyle] || TOPS.hoodie, top = L.top, dk = shade(top, 0.72), bot = L.bottom;
    const dress = L.topStyle === 'dress', end = dress ? 250 : T.end;
    let out = `<path d="${torsoPath(B, B.hipY + 4)}" fill="${L.skin}" stroke="${INK}" stroke-width="2.4"/>`;   // skin under everything (shows at a crop top's midriff)
    /* bottoms (under the top) */
    const bs = dress ? 'skirtlong' : L.bottomStyle;
    if (bs === 'skirt' || bs === 'skirtlong') { const yb = bs === 'skirt' ? 330 : 350, flare = bs === 'skirt' ? 16 : 22; out += `<path d="M${100 - B.w - 1} ${B.waistY - 4} L${100 + B.w + 1} ${B.waistY - 4} L${100 + B.h + flare} ${yb} Q100 ${yb + 8} ${100 - B.h - flare} ${yb} Z" fill="${dress ? top : bot}" stroke="${INK}" stroke-width="2.4"/><path d="M${100 - B.h} ${yb - 4} L${100 - B.h - 6} ${yb - 40} M100 ${yb + 2} L100 ${yb - 46} M${100 + B.h} ${yb - 4} L${100 + B.h + 6} ${yb - 40}" stroke="${shade(dress ? top : bot, 0.7)}" stroke-width="2" fill="none"/>`; }
    else out += `<path d="M${100 - B.w - 1} ${B.waistY - 4} C${100 - B.h - 2} ${B.waistY + 14} ${100 - B.h - 2} ${B.hipY - 10} ${100 - B.h} ${B.hipY + 6} L100 ${B.crotchY} L${100 + B.h} ${B.hipY + 6} C${100 + B.h + 2} ${B.hipY - 10} ${100 + B.h + 2} ${B.waistY + 14} ${100 + B.w + 1} ${B.waistY - 4} Z" fill="${bot}" stroke="${INK}" stroke-width="2.4"/>`;
    /* the top: body, then the chest as its own part so it can move */
    out += `<path d="${torsoPath(B, end, 2)}" fill="${top}" stroke="${INK}" stroke-width="2.4"/>`;
    const bx = 9 + B.bust * 4, rx = 10 + B.bust * 5, ry = 7 + B.bust * 6, cy = B.chestY - 2 + B.bust * 3;
    out += `<g data-p="chest"><ellipse cx="${100 - bx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${top}"/><ellipse cx="${100 + bx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${top}"/><path d="M${100 - bx - rx * 0.8} ${cy + ry * 0.55} Q${100 - bx} ${cy + ry + 2} ${100 - 2} ${cy + ry * 0.5} M${100 + 2} ${cy + ry * 0.5} Q${100 + bx} ${cy + ry + 2} ${100 + bx + rx * 0.8} ${cy + ry * 0.55}" fill="none" stroke="${dk}" stroke-width="2" stroke-linecap="round"/></g>`;
    /* neckline */
    if (T.neck === 'hood') out += `<path d="M70 152 C80 172 120 172 130 152" fill="none" stroke="${dk}" stroke-width="5"/><rect x="92" y="150" width="16" height="26" fill="${L.shirt}" stroke="${INK}" stroke-width="1.6"/><line x1="92" y1="166" x2="90" y2="196" stroke="#b9b2c4" stroke-width="2"/><line x1="108" y1="166" x2="110" y2="196" stroke="#b9b2c4" stroke-width="2"/>`;
    else if (T.neck === 'v') out += `<path d="M86 150 L100 178 L114 150 Z" fill="${L.skin}" stroke="${INK}" stroke-width="2"/>`;
    else if (T.neck === 'scoop') out += `<path d="M84 150 Q100 172 116 150 Z" fill="${L.skin}" stroke="${INK}" stroke-width="2"/>`;
    else if (T.neck === 'high') out += `<rect x="88" y="140" width="24" height="14" rx="4" fill="${top}" stroke="${INK}" stroke-width="2"/>`;
    else out += `<path d="M88 150 Q100 162 112 150" fill="${L.skin}" stroke="${INK}" stroke-width="2"/>`;
    if (dress) out += `<path d="M${100 - B.w - 2} ${B.waistY - 6} L${100 + B.w + 2} ${B.waistY - 6}" stroke="${dk}" stroke-width="4"/>`;
    return out;
  }
  const MARKUP_FN = () => { const L = LK(), B = BODY(L); return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:100%;touch-action:none;user-select:none;-webkit-user-select:none">
  <defs><radialGradient id="wzbg" cx="50%" cy="30%" r="80%"><stop offset="0" stop-color="${L.bg1}"/><stop offset="1" stop-color="${L.bg2}"/></radialGradient></defs>
  <rect x="-200" y="-40" width="600" height="600" fill="url(#wzbg)"/>
  <ellipse cx="100" cy="${B.footY + 6}" rx="52" ry="7" fill="#000" opacity=".22"/>
  <g data-p="hairBack">${hairBack(L)}</g>
  <g data-p="figure">
    <g data-p="legs"></g>
    <g data-p="armL"></g>
    <g data-p="body">
      <rect x="92" y="126" width="16" height="30" fill="${L.skin}" stroke="${INK}" stroke-width="2"/>
      ${clothes(L, B)}
    </g>
    <g data-p="armR"></g>
  </g>
  <g data-p="head">
    <ellipse cx="100" cy="96" rx="34" ry="40" fill="${L.skin}"/>
    <ellipse data-p="blushL" cx="79" cy="110" rx="8" ry="4.5" fill="#e8798e" opacity="0"/><ellipse data-p="blushR" cx="121" cy="110" rx="8" ry="4.5" fill="#e8798e" opacity="0"/>
    <path d="M100 103 L98 111 L101 111" fill="none" stroke="#d8c8cf" stroke-width="1.5"/>
    <g data-p="eyeL"><ellipse data-p="irisL" cx="87" cy="100" rx="3.8" ry="4.2" fill="${L.iris}"/><circle data-p="glintL" cx="88.3" cy="98.6" r="1.1" fill="#fff"/><path data-p="lidL" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>
    <g data-p="eyeR"><ellipse data-p="irisR" cx="113" cy="100" rx="3.8" ry="4.2" fill="${L.iris}"/><circle data-p="glintR" cx="114.3" cy="98.6" r="1.1" fill="#fff"/><path data-p="lidR" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>
    <path data-p="browL" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><path data-p="browR" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
    <path data-p="mouth" fill="${L.lip}" stroke="${L.lip}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    ${L.glasses ? `<g fill="none" stroke="${INK}" stroke-width="2"><rect x="77" y="92" width="20" height="15" rx="5"/><rect x="103" y="92" width="20" height="15" rx="5"/><path d="M97 98 L103 98 M77 97 L67 94 M123 97 L133 94"/></g>` : ''}
    ${hairFront(L)}
  </g>
</svg>`; };
  /* an arm or leg: two thick stroked segments (ink under colour), cel style */
  const limb = (pts, widths, colors) => { let s = ''; for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]]; s += `<path d="M${a[0].toFixed(1)} ${a[1].toFixed(1)} L${b[0].toFixed(1)} ${b[1].toFixed(1)}" stroke="${INK}" stroke-width="${widths[i] + 4}" stroke-linecap="round"/>`; } for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]]; s += `<path d="M${a[0].toFixed(1)} ${a[1].toFixed(1)} L${b[0].toFixed(1)} ${b[1].toFixed(1)}" stroke="${colors[i]}" stroke-width="${widths[i]}" stroke-linecap="round"/>`; } return s; };
  /* arm poses: [upper arm angle from straight down, outward positive; elbow bend] for each side, per gesture */
  const ARM = {
    rest: [[9, -6], [9, -6]], wave: [[9, -6], [150, 20]], fingerwave: [[9, -6], [40, -120]], cheer: [[160, 10], [160, 10]], stretch: [[170, 5], [170, 5]], crossarms: [[20, -130], [20, -130]],
    hips: [[40, -110], [40, -110]], shrug: [[25, -70], [25, -70]], clap: [[18, -115], [18, -115]], peace: [[9, -6], [120, 40]], oksign: [[9, -6], [60, -100]], kiss: [[9, -6], [30, -150]],
    facepalm: [[9, -6], [35, -160]], think: [[22, -128], [30, -158]], bow: [[5, -4], [5, -4]], dance: [[60, 40], [60, 40]], hair: [[9, -6], [140, -60]], flipoff: [[9, -6], [80, -40]], fox: [[9, -6], [70, -90]], crossed: [[9, -6], [30, -120]],
  };
  // ---- face shapes ----
  const LID = {
    open: x => `M${x - 7} 99 Q${x} 92 ${x + 7} 99`, wide: x => `M${x - 7} 98 Q${x} 89 ${x + 7} 98`, half: x => `M${x - 7} 99 Q${x} 96.5 ${x + 7} 99`,
    shut: x => `M${x - 7} 100 Q${x} 103 ${x + 7} 100`, smile: x => `M${x - 7} 101 Q${x} 94 ${x + 7} 101`,
    squintL: x => `M${x - 6} 95 L${x + 5} 100 L${x - 6} 105`, squintR: x => `M${x + 6} 95 L${x - 5} 100 L${x + 6} 105`,
    dizzy: x => `M${x - 5} 95 L${x + 5} 105 M${x + 5} 95 L${x - 5} 105`,
  };
  const BROW = { // [left, right]
    flat: ['M80 88 L94 87', 'M106 87 L120 88'], angry: ['M80 84 L94 90', 'M106 90 L120 84'], sad: ['M80 90 L94 85', 'M106 85 L120 90'],
    up: ['M80 84 L94 83', 'M106 83 L120 84'], cocked: ['M80 88 L94 87', 'M106 82 L120 84'],
  };
  const MOUTH = {
    flat: 'M92 120 Q100 116 108 120 Q100 125 92 120 Z', smile: 'M90 118 Q100 128 110 118 Q100 122 90 118 Z', grin: 'M89 117 Q100 133 111 117 Z',
    frown: 'M92 124 Q100 116 108 124 Q100 120 92 124 Z', o: 'M96 121 a4 5 0 1 0 8 0 a4 5 0 1 0 -8 0 Z', smirk: 'M92 121 Q101 125 110 116 Q101 121 92 121 Z',
    pout: 'M95 121 Q100 116 105 121 Q100 125 95 121 Z', wavy: 'M92 121 q4 -4 8 0 t8 0', talk: 'M94 119 Q100 128 106 119 Q100 117 94 119 Z', talk2: 'M96 120 a4 3 0 1 0 8 0 a4 3 0 1 0 -8 0 Z',
  };
  // an expression: lids, brows, mouth, blush 0..1, where the eyes rest (gx, gy), head pose (tilt deg, drop px)
  const FACE = {
    tipsy: { lid: 'half', brow: 'up', mouth: 'smile', blush: 0.9, tilt: 5 }, high: { lid: 'half', brow: 'flat', mouth: 'smile', tilt: -3, gy: -0.5 },
    neutral: { lid: 'open', brow: 'flat', mouth: 'flat' }, happy: { lid: 'open', brow: 'up', mouth: 'smile' }, playful: { lid: 'open', brow: 'cocked', mouth: 'smirk', tilt: 4 },
    chill: { lid: 'half', brow: 'flat', mouth: 'flat', tilt: -3 }, focused: { lid: 'half', brow: 'angry', mouth: 'flat', gy: 1.5 }, excited: { lid: 'wide', brow: 'up', mouth: 'grin' },
    tired: { lid: 'half', brow: 'sad', mouth: 'pout', tilt: 5, drop: 3, gy: 1.5 }, grumpy: { lid: 'half', brow: 'angry', mouth: 'frown' }, sad: { lid: 'open', brow: 'sad', mouth: 'frown', drop: 2, gy: 2 },
    anxious: { lid: 'wide', brow: 'sad', mouth: 'wavy' }, joy: { lid: 'smile', brow: 'up', mouth: 'grin', blush: 0.5 }, blush: { lid: 'open', brow: 'sad', mouth: 'pout', blush: 1, gx: 2.5, gy: 1.5 },
    surprised: { lid: 'wide', brow: 'up', mouth: 'o' }, flinch: { lid: 'squint', brow: 'sad', mouth: 'wavy' }, dizzy: { lid: 'dizzy', brow: 'sad', mouth: 'o' },
    angry: { lid: 'open', brow: 'angry', mouth: 'frown', blush: 0.4 }, eyeroll: { lid: 'half', brow: 'cocked', mouth: 'flat', gy: -3 }, thinking: { lid: 'open', brow: 'cocked', mouth: 'pout', gx: 2.5, gy: -2.5 },
    suspicious: { lid: 'half', brow: 'cocked', mouth: 'flat', gx: -2.5 },
  };
  // her words and actions -> a passing expression (first match wins)
  const FEEL = [
    [/roll(s|ed|ing)? her eyes|eye ?roll/i, 'eyeroll'], [/blush|fluster|embarrass|looks away|hides her face/i, 'blush'], [/gasp|jaw drops|eyes widen|wait,? what|what\?!|\?!/i, 'surprised'],
    [/glare|scowl|annoyed|huff|scoff|crosses her arms|ugh\b/i, 'grumpy'], [/laugh|giggl|snort|cackl|haha|lmao|\blol\b/i, 'joy'], [/smirk|wink|teas|grin/i, 'playful'],
    [/smil|beam|\bnice\b|love (it|that)|thank/i, 'happy'], [/yawn|sleepy|exhausted|so tired/i, 'tired'], [/frown|sigh|sorry|\bsad\b|tear/i, 'sad'],
    [/nervous|fidget|bites her lip|\bum+\b|\buh+\b/i, 'anxious'], [/squint|narrow(s|ed)? her eyes|suspicious|side-?eye/i, 'suspicious'], [/!!|omg|oh my god|no way|yes!/i, 'excited'], [/hmm+|thinks|ponder|considers/i, 'thinking'],
  ];

  // ---- the cartoon renderer. A renderer draws the state the controller hands it and says where a touch landed. ----
  // locate() answers in "puppet space": a 200 x 200 square with the face centre at (100,100), the nose at (100,108),
  // hair above y 80 and the body below y 150. Any other renderer maps its own picture onto the same square.
  function puppet(stage) {
    const wrap = document.createElement('div'); wrap.style.cssText = 'width:100%;height:100%'; wrap.innerHTML = MARKUP_FN(); stage.appendChild(wrap);
    const svg = wrap.firstElementChild, P = {}; let shown = '';
    svg.querySelectorAll('[data-p]').forEach(n => { P[n.dataset.p] = n; });
    const L = LK(), B = BODY(L), T = TOPS[L.topStyle] || TOPS.hoodie;
    /* views: the portrait is the head and shoulders; full is all of her */
    const VIEWS = { portrait: [0, 0, 200, 200], full: [-10, 18, 220, B.footY + 6] };
    let view = 'portrait'; const setView = v => { view = VIEWS[v] ? v : 'portrait'; svg.setAttribute('viewBox', VIEWS[view].join(' ')); };
    /* arms: blended pose angles; chest and hair tails: springs driven by how the body moves */
    const arm = { L: [9, -6], R: [9, -6] }; let lastPose = '', armKey = '';
    const jig = { y: 0, v: 0, x: 0, vx: 0 }, tail = { a: 0, v: 0 }; let prevY = 0, prevV = 0, hop = 0;
    const sleeve = T.sleeve, skin = L.skin, top = L.top;
    function drawArms(t, g) {
      const pose = (g && ARM[g.name]) || ARM.rest, w = g ? g.w : 0;
      for (const [k, i] of [['L', 0], ['R', 1]]) { const want = pose[i]; arm[k][0] += ((ARM.rest[i][0] + (want[0] - ARM.rest[i][0]) * w) - arm[k][0]) * 0.25; arm[k][1] += ((ARM.rest[i][1] + (want[1] - ARM.rest[i][1]) * w) - arm[k][1]) * 0.25; }
      let wig = 0; if (g && (g.name === 'wave' || g.name === 'fingerwave')) wig = Math.sin(g.t * 12) * 22; if (g && g.name === 'clap') wig = Math.sin(g.t * 16) * 14; if (g && g.name === 'dance') wig = Math.sin(g.t * 6) * 30;
      const idle = Math.sin(t / 1300) * 2;
      const key = [arm.L[0], arm.L[1], arm.R[0], arm.R[1], wig, idle].map(v => v.toFixed(1)).join();
      if (key === armKey) return; armKey = key;
      for (const [k, side] of [['L', -1], ['R', 1]]) {
        const a1 = (arm[k][0] + idle) * Math.PI / 180, a2 = (arm[k][1] + (k === 'R' || (g && ['clap', 'dance'].includes(g.name)) ? wig : 0)) * Math.PI / 180;
        const sx = 100 + side * (B.sh - 4), sy = 160;
        const ex = sx + side * 60 * Math.sin(a1), ey = sy + 60 * Math.cos(a1);
        const wx = ex + side * 54 * Math.sin(a1 + a2), wy = ey + 54 * Math.cos(a1 + a2);
        const mx = sx + (ex - sx) * 0.5, my = sy + (ey - sy) * 0.5;
        P['arm' + k].innerHTML = limb([[sx, sy], [ex, ey], [wx, wy]], [15, 12], [sleeve === 'long' ? top : skin, sleeve === 'long' ? top : skin]) + (sleeve === 'short' ? limb([[sx, sy], [mx, my]], [19], [top]) : '') + `<circle cx="${(wx + side * 2 * Math.sin(a1 + a2)).toFixed(1)}" cy="${(wy + 2 * Math.cos(a1 + a2)).toFixed(1)}" r="7.5" fill="${skin}" stroke="${INK}" stroke-width="2"/>`;
      }
    }
    function drawLegs() {
      const bs = L.topStyle === 'dress' ? 'skirtlong' : L.bottomStyle, bot = L.bottom;
      const legCol = seg => bs === 'jeans' || bs === 'leggings' ? (bs === 'leggings' ? shade(bot, 0.8) : bot) : skin;
      let s = '';
      for (const side of [-1, 1]) {
        const hx = 100 + side * (B.h * 0.5), kx = 100 + side * (B.h * 0.42), ax = 100 + side * (B.h * 0.38);
        if (bs === 'shorts') s += limb([[hx, B.hipY], [hx + (kx - hx) * 0.45, B.hipY + (B.kneeY - B.hipY) * 0.45]], [26], [bot]);
        s += limb([[hx, B.hipY + 6], [kx, B.kneeY], [ax, B.ankY]], [bs === 'leggings' ? 21 : 23, bs === 'leggings' ? 15 : 17], [legCol(0), legCol(1)]);
        if (bs === 'shorts') s += limb([[hx, B.hipY], [hx + (kx - hx) * 0.42, B.hipY + (B.kneeY - B.hipY) * 0.42]], [25], [bot]);
        const sc = L.shoes, fx = ax + side * 5, fy = B.footY - 5;
        if (L.shoeStyle === 'boots') s += `<rect x="${ax - 10}" y="${B.ankY - 34}" width="20" height="38" rx="4" fill="${sc}" stroke="${INK}" stroke-width="2.2"/><ellipse cx="${fx}" cy="${fy}" rx="14" ry="7.5" fill="${sc}" stroke="${INK}" stroke-width="2.2"/><rect x="${ax - 9}" y="${B.ankY - 30}" width="18" height="34" fill="${sc}"/>`;
        else if (L.shoeStyle === 'sneakers') s += `<ellipse cx="${fx}" cy="${fy}" rx="14" ry="7.5" fill="${sc}" stroke="${INK}" stroke-width="2.2"/><path d="M${fx - 14} ${fy + 3} L${fx + 14} ${fy + 3}" stroke="#f2f2f2" stroke-width="3"/>`;
        else s += `<ellipse cx="${fx}" cy="${fy + 1}" rx="12" ry="6" fill="${sc}" stroke="${INK}" stroke-width="2.2"/>`;
      }
      P.legs.innerHTML = s;
    }
    drawLegs(); setView('portrait');
    return {
      locate(e) { const m = svg.getScreenCTM(); if (!m) return { x: 100, y: 100 }; const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(m.inverse()); return { x: q.x, y: q.y }; },
      dispose() { wrap.remove(); }, setView, view: () => view,
      presence(mode) { wrap.style.visibility = mode === 'gone' || mode === 'leave' ? 'hidden' : 'visible'; },
      call(on) { wrap.style.visibility = on ? 'visible' : 'hidden'; },
      thumb(cb) { const c = svg.cloneNode(true); c.setAttribute('viewBox', VIEWS.portrait.join(' ')); cb('data:image/svg+xml,' + encodeURIComponent(c.outerHTML)); },
      jolt(v) { jig.v += v; tail.v += v * 0.6; },
      draw({ t, dt, face, lid, mouth, look, rot, tx, ty, sq, breathe, gesture }) {
        const key = lid + face.brow + mouth;
        if (key !== shown) {
          shown = key;
          P.lidL.setAttribute('d', (LID[lid] || LID[lid + 'L'])(87)); P.lidR.setAttribute('d', (LID[lid] || LID[lid + 'R'])(113));
          const eyes = ['open', 'wide', 'half'].includes(lid) ? '' : 'none';
          for (const n of ['irisL', 'irisR', 'glintL', 'glintR']) P[n].style.display = eyes;
          P.browL.setAttribute('d', BROW[face.brow][0]); P.browR.setAttribute('d', BROW[face.brow][1]);
          P.mouth.setAttribute('d', MOUTH[mouth]); P.mouth.setAttribute('fill', mouth === 'wavy' ? 'none' : L.lip);
        }
        for (const [n, cx] of [['L', 87], ['R', 113]]) {
          P['iris' + n].setAttribute('cx', cx + look.x); P['iris' + n].setAttribute('cy', 100 + look.y); P['iris' + n].setAttribute('ry', lid === 'half' ? 3 : 4.2);
          P['glint' + n].setAttribute('cx', cx + 1.3 + look.x); P['glint' + n].setAttribute('cy', 98.6 + look.y);
        }
        const blush = face.blush || 0; P.blushL.setAttribute('opacity', blush); P.blushR.setAttribute('opacity', blush);
        /* the whole figure: breathing, a little weight shift, hops for bounce, jump, cheer and dance */
        const g = gesture, hopping = g && ['bounce', 'jump', 'cheer', 'dance'].includes(g.name);
        const want = hopping ? -Math.abs(Math.sin(g.t * (g.name === 'jump' ? 6 : 9))) * (g.name === 'jump' ? 16 : 6) * g.w : 0;
        hop += (want - hop) * Math.min(1, dt * 18);
        const sway = Math.sin(t / 2100) * 1.2, bodyY = hop + ty * 0.35 - breathe * 0.8;
        /* chest and hair follow the body's movement through springs; the bounce slider sets how much */
        const dts = Math.max(0.001, dt), vel = (bodyY - prevY) / dts, acc = (vel - prevV) / dts; prevY = bodyY; prevV = vel;
        const amt = L.bounce, k = 260 - 120 * amt, c = 9 - 5 * amt;
        jig.v += (-k * jig.y - c * jig.v - acc * 0.9 * amt) * dts; jig.y += jig.v * dts; jig.y = Math.max(-6, Math.min(6, jig.y));
        jig.vx += (-k * jig.x - c * jig.vx - tx * 2 * amt) * dts; jig.x += jig.vx * dts; jig.x = Math.max(-3, Math.min(3, jig.x));
        tail.v += (-60 * tail.a - 4 * tail.v - (rot + sway) * 3 - acc * 0.05) * dts; tail.a += tail.v * dts;
        P.chest.setAttribute('transform', `translate(${(jig.x * amt).toFixed(2)} ${(jig.y * (0.4 + amt)).toFixed(2)})`);
        P.figure.setAttribute('transform', `translate(${(tx * 0.25 + sway * 0.4).toFixed(2)} ${bodyY.toFixed(2)}) rotate(${(sway * 0.4 + (g && g.name === 'dance' ? Math.sin(g.t * 6) * 4 : 0)).toFixed(2)} 100 ${B.hipY})`);
        P.head.setAttribute('transform', `translate(${(tx + sway * 0.4).toFixed(2)} ${(ty + hop).toFixed(2)}) rotate(${rot.toFixed(2)} 100 140) translate(0 ${(140 * (1 - sq)).toFixed(2)}) scale(1 ${sq.toFixed(3)})`);
        P.hairBack.setAttribute('transform', `translate(${(tx * 0.5 + sway * 0.4).toFixed(2)} ${(ty * 0.5 + hop).toFixed(2)}) rotate(${(rot * 0.45).toFixed(2)} 100 140)`);
        if (P.tailL) P.tailL.setAttribute('transform', `rotate(${(tail.a * 6).toFixed(2)} 60 70)`); if (P.tailR) P.tailR.setAttribute('transform', `rotate(${(tail.a * 6).toFixed(2)} 140 70)`);
        drawArms(t, g);
      },
    };
  }

  // ---- the controller: moods, passing expressions, touch, her reserve, the springs. The same for every renderer. ----
  // things she physically does, read from the actions in her reply: [pattern, gesture, seconds]
  /* an emoji in her reply is her doing the thing: she sends an eye roll, she rolls her eyes */
  const EMOJI_GEST = [[/\u{1F644}/u, 'eyeroll', 3.2], [/[\u{1F61B}-\u{1F61D}\u{1F92A}]/u, 'tongue', 3.2], [/\u{1F926}/u, 'facepalm', 4.5], [/\u{1F937}/u, 'shrug', 1.8], [/\u{1F44F}/u, 'clap', 4], [/\u{1F44B}/u, 'wave', 2.6], [/\u270C/u, 'peace', 3], [/\u{1FAF0}/u, 'fingerheart', 3.2], [/\u{1F44C}/u, 'oksign', 2.8], [/\u{1F91E}/u, 'crossed', 3], [/\u{1F595}/u, 'flipoff', 2.5], [/\u{1F971}/u, 'yawn', 3], [/[\u{1F618}\u{1F48B}]/u, 'kiss', 2.5], [/\u{1F64C}/u, 'cheer', 3.6], [/\u{1F914}/u, 'think', 5], [/\u{1F97A}/u, 'pout', 5], [/[\u{1F602}\u{1F923}]/u, 'laugh', 2.5], [/\u{1F92D}/u, 'chuckle', 3.4], [/\u{1F631}/u, 'eep', 3], [/\u{1F647}/u, 'bow', 2], [/\u{1F645}/u, 'crossarms', 5], [/\u{1F483}/u, 'dance', 4]];
  const GEST = [
    [/rolls? her eyes|eye[- ]?roll/i, 'eyeroll', 3.2], [/chuckl|snicker|soft laugh|laughs? (softly|quietly|under her breath)|huffs? a laugh/i, 'chuckle', 3.4], [/\bclap/i, 'clap', 4], [/face ?palm|buries her face in her hand|hand over her (face|eyes)|pinches the bridge of her nose/i, 'facepalm', 4.5],
    [/taps? her chin|strokes? her chin|hand (on|to) her chin|thinks? (about|for|it over)|ponders?|considers? (it|this|that|him|you)|mulls?|thoughtful/i, 'think', 5], [/cross(es|ed|ing)? her arms|folds? her arms|arms crossed|arms folded/i, 'crossarms', 6], [/hands? on her hips?|plants? her hands/i, 'hips', 5],
    [/cheers?\b|throws? (up )?her (hands|arms)|fist pump|pumps? (a|her) fist|arms? in the air|whoops?/i, 'cheer', 3.6], [/pouts?|sulks?|puffs? (out )?her cheeks/i, 'pout', 5], [/sticks? (out )?her tongue|tongue (out|poking)|pokes? (out )?her tongue|blows? (him |you )?a raspberry|\bbleh\b|\bnyeh\b/i, 'tongue', 3.2],
    [/finger heart|heart with her (fingers|thumb)|(tiny|little|small) heart/i, 'fingerheart', 3.2], [/peace sign|throws? (up )?(a |the )?(peace|deuces)|\bv[- ]sign|victory sign/i, 'peace', 3], [/ok(ay)? (sign|gesture|hand)|\ba-ok\b/i, 'oksign', 2.8],
    [/fox (sign|hand|gesture|ears)|makes? a (little )?fox/i, 'fox', 3], [/cross(es|ed|ing)? her fingers|fingers crossed/i, 'crossed', 3], [/flips? (him|you|it|that) off|(gives?|shows?) (him|you) the (middle )?finger|middle finger|flips? the bird/i, 'flipoff', 2.6],
    [/(wiggl|waggl)(es|ing)? her fingers|finger wave|(little|tiny) wave/i, 'fingerwave', 3],
    [/\bwav(e|es|ed|ing)\b|raises? a hand|lifts? a hand|holds up a hand|high[- ]fiv/i, 'wave', 2.6], [/\bnod(s|ded|ding)?\b/i, 'nod', 1.5],
    [/shak(es|ing) her head/i, 'shake', 1.7], [/\bshrug/i, 'shrug', 1.8], [/\byawn/i, 'yawn', 3], [/\bstretch/i, 'stretch', 3.2],
    [/\bbows?\b|dips her head/i, 'bow', 2], [/lean(s|ed|ing)? (in|forward|closer)|sits? forward|scoots? (closer|forward)/i, 'lean', 3], [/lean(s|ed|ing)? back|sinks? (back|into)|settles? (back|into)|reclin/i, 'leanback', 3],
    [/sits? up|straightens?( up)?|perks? up/i, 'situp', 2.6], [/slump|deflat|droops?|sags?/i, 'slump', 3],
    [/wiggl|kick(s|ing)? her (feet|foot|boots?)|taps? her (foot|boot)|swing(s|ing)? her (feet|legs)|bounces her (foot|leg)/i, 'feet', 2.8], [/shift(s|ed|ing)? in her (seat|chair)|squirms?|fidget/i, 'shift', 3],
    [/tilt(s|ed|ing)? her head|cock(s|ed)? her head/i, 'tilt', 2.2], [/headbang|bangs her head|bobs her head/i, 'headbang', 2.6], [/flips? her hair|toss(es)? her hair|hair flip/i, 'flip', 1.6],
    [/looks? away|glances? away|turns? away|averts?|looks? (off )?to the side/i, 'lookaway', 2.6], [/looks? down|stares? at (her|the) (lap|boots|floor|table)|hangs her head/i, 'lookdown', 2.4], [/looks? up|stares? at the ceiling|rolls her eyes/i, 'lookup', 1.8],
    [/laugh|giggl|snicker|cackl|snort|chuckl/i, 'laugh', 2.2], [/\bsigh|exhales|huffs?/i, 'sigh', 2.2], [/bounc(es|ing)|bops|hops in her seat/i, 'bounce', 2], [/\bdanc|sways? to|grooves?|shimm/i, 'dance', 3.5],
    [/cring|winc|recoil|shudder|shrinks? back/i, 'cringe', 2], [/jumps? (up|for joy|up and down|in excitement)|hops? up/i, 'jump', 1.6], [/blows? (him |you )?a kiss|kiss(es|ed)? (him|his|you|your)|gives? (him|you) a (quick |soft |little )?kiss/i, 'kiss', 6.5], [/jumps?|startl|flinch|jolts?/i, 'jolt', 1.4],
  ];
  // bigger things she does, also read from her actions: these change what she is busy with (see the routine in avatar-vrm.js)
  const ROUTINE = [
    [/(puts?|returns?|slides?|places?|tucks?) (her |the |that )?(book|novel|tome) (back|away)|back on(to)? the (book ?)?shelf/i, 'returnbook'],
    [/book ?shelf|\bshel(f|ves)\b|(gets?|grabs?|fetch(es)?|finds?|picks? out|retrieves?|brings? (back|over)|comes? back with|goes? (to get|for|and gets?|to grab|to find)|looks? for) (him |you |herself )?(a |her |the |another |that |some |one of her )?(new |different |good )?(book|novel|tome|rulebook)/i, 'fetchbook'],
    [/(gets?|grabs?|fetch(es)?|makes?|pours?|refills?|brews?|tops? (up|off)|goes? (to get|for|to make)) (him |you |herself )?(a |an |her |the |another |some |more )?(fresh |new |hot )?(coffee|drink|tea|mug|cup|energy drink|water|refill|cocoa)|\bkettle\b|coffee ?maker|\bcounter\b|kitchen/i, 'fetchdrink'],
    [/hugs? (one|a) knee|rests? her chin on her knee|pulls? (one|a) (knee|leg) up/i, 'knee'], [/curls? up|hugs? her knees|pulls? her (knees|legs) (up|in|to her chest)|tucks? her (legs|feet) (up|under)/i, 'curl'], [/(plays?|fiddles?|toys?) with her hair|runs? (a hand|her fingers) through her hair|twirls? (a strand|a lock|her hair)/i, 'hair'],
    [/(drapes?|swings?|throws?|hooks?|kicks?) her legs over|sits? sideways|sideways in (her|the) (chair|seat|armchair)/i, 'drape'],
    [/cross(es|ed|ing)? her (legs|ankles|feet|boots)/i, 'crosslegs'], [/(puts?|sets?|plants?|drops?|swings?) her (feet|boots) (back )?(down|on(to)? the floor|off the table)|feet off the table/i, 'feetdown'], [/(puts?|props?|kicks?|swings?) her (feet|boots) (back )?up/i, 'feetup'],
    [/\byoga\b|tree pose|warrior pose|sun salutation|does? (some |a few |her )?(stretches|poses)|rolls? out (her|a|the) (yoga )?mat|meditat/i, 'yoga'],
    [/(lies?|lays?|flops?|sprawls?|stretches) (back |down |out )*(on|onto|across) (her|the) bed|climbs? (on|onto|into) (her|the) bed/i, 'liedown'],
    [/(sits?|flops?|settles?|curls? up|plops?|drops?|sinks?|lies?|lays?|stretches?|sprawls?) (back |down |out )*(on|onto|in|into|across) (the|a|her|his|one of the) (bean ?bags?|log|camp chair|sofa|couch|picnic blanket|blanket|sleeping bag|blanket fort|fort|stool)/i, 'perch'],
    [/sits? (back )?down|flops? (back )?(down|into|onto)|(drops?|sinks?|settles?|plops?) (back )?(down )?(into|onto|in) (her|the) (chair|seat|armchair)|returns? to her (chair|seat)/i, 'sit'],
    [/gets? up|stands? up|gets? to her feet|rises? (from|to)|\bpac(es|ing)\b|walks? (around|over|off|away|across)|wanders?|strolls?/i, 'pace'],
    [/(puts?|sets?|tosses?|lays?) (down )?(her |the )?(book|phone)|closes? (her|the) book|pockets? her phone/i, 'sit'],
    [/(picks? up|grabs?|opens?|reads?|reading|flips? through|goes back to|returns? to|buries herself in) (her |the |a )?(book|novel|notes|tome|rulebook)|turns? (a|the) page/i, 'read'],
    [/(checks?|grabs?|picks? up|pulls? out|scrolls?|looks? at|glances? at|taps? (at|on)|types? on) (through )?(her |the )?phone|\bscroll(s|ing)?\b|\btexts?\b/i, 'phone'],
    [/\bsips?\b|takes? a (sip|drink|swig|gulp)|drinks?|picks? up her (mug|cup|coffee|drink)/i, 'sip'],
  ];
  // what she drifts into on her own when nothing is happening, and how she physically takes a touch
  const IDLE = [['shift', 3], ['feet', 2.4], ['tilt', 2], ['sigh', 2.2], ['flip', 1.6], ['stretch', 3.2], ['leanback', 3], ['think', 3]];   // on her own she fidgets, but she stays facing you
  const IDLE_SHY = [...IDLE, ['lookaway', 2.4], ['lookdown', 2], ['lookaway', 2.4]];                                                              // shy, flustered or low: her eyes slide off you now and then
  // how she is for the hour after she comes back from somewhere, when it shows: [resting face, what she keeps doing]
  const STATE = { cagey: ['anxious', [['lookaway', 2], ['lookdown', 1.6], ['shift', 2], ['lookaway', 2.4]]], tipsy: ['tipsy', [['jolt', 1], ['laugh', 1.6], ['shift', 3], ['tilt', 2.4]]], high: ['high', [['tilt', 3], ['lookup', 2.6], ['laugh', 1.8], ['feet', 2.4]]],
    groggy: ['tired', [['yawn', 3], ['slump', 3], ['yawn', 3]]], hyper: ['excited', [['bounce', 2], ['feet', 2.4], ['shift', 2], ['nod', 1.2]]], upset: ['sad', [['lookdown', 3], ['sigh', 2.4], ['lookaway', 3]]] };
  const TOUCH_BODY = { poke: ['jolt', 1.2], boop: ['jolt', 1], pat: ['bounce', 1], swat: ['cringe', 1.6], spam: ['cringe', 2], body: ['lookdown', 1.4], petEnd: ['leanback', 2], gift: ['situp', 2.2], wave: ['wave', 2.2], laugh: ['laugh', 2], stare: ['shift', 2.4] };

  function mount(stage, opts = {}) {
    stage.textContent = ''; stage.style.position = 'relative';
    let R = puppet(stage);
    const em = document.createElement('div'); em.style.cssText = 'position:absolute;right:8%;top:8%;font-size:calc(var(--emote, 1) * 22px);line-height:1;opacity:0;pointer-events:none;z-index:2;width:auto;height:auto';
    stage.appendChild(em);
    let mood = 'neutral', temp = null, tempUntil = 0, thinking = false, talkUntil = 0, emoteUntil = 0;
    let blinkAt = performance.now() + 2000, blinkEnd = 0, glanceAt = 0, gaze = { x: 0, y: 0 }, look = { x: 0, y: 0 }, pointerLook = null, pointerLookUntil = 0;
    const sp = { rot: { x: 0, v: 0 }, tx: { x: 0, v: 0 }, ty: { x: 0, v: 0 }, sq: { x: 0, v: 0 } }; // springs, rest at 0
    const taps = [];
    const now = () => performance.now();

    let voice = null, state = ''; let gesture = null, idleAt = 0; // gesture: { name, t0, dur }
    const QUICK = new Set(['nod', 'shake', 'flip', 'jump', 'kiss', 'wave', 'fingerwave', 'eyeroll', 'laugh', 'bounce', 'headbang']);   // these are over when they are over; the rest are poses that hold
    function doGesture(name, dur = 2.2) { gesture = { name, t0: now(), dur: dur * 1000 }; idleAt = now() + dur * 1000 + (STATE[state] ? 14000 + Math.random() * 16000 : 28000 + Math.random() * 40000); if (name === 'nod') kick(0, 0, 70); else if (name === 'shake') kick(0, 90); else if (name === 'wave') kick(90); else if (name === 'tilt') show('playful', dur * 1000); }
    function show(face, ms) { temp = face; tempUntil = now() + ms; }
    function emote(ch, ms = 1400) { em.textContent = ch; emoteUntil = now() + ms; if (opts.onEmote) opts.onEmote(ch); }
    function kick(rot = 0, tx = 0, ty = 0, sq = 0) { sp.rot.v += rot; sp.tx.v += tx; sp.ty.v += ty; sp.sq.v += sq; }
    // Her reserve: touches add up. irk rises with pokes and swats, fond with pats and pets; both fade over a few minutes.
    // Enough of either changes her resting face and how she takes the next touch.
    let irk = 0, fond = 0;
    const RESERVE = { poke: [1, 0], boop: [0.3, 0.5], pat: [0, 1], petEnd: [-1, 2], swat: [2.5, -1], body: [0.7, 0], spam: [3, -1] };
    const sour = () => irk >= 2.4 || (irk < 1.5 && fond >= 3 ? false : ['grumpy', 'tired', 'sad', 'anxious'].includes(mood));
    function touched(kind, dir) {
      const r = RESERVE[kind] || [0, 0]; irk = Math.max(0, Math.min(8, irk + r[0])); fond = Math.max(0, Math.min(8, fond + r[1]));
      react(kind, dir); if (opts.onTouch) opts.onTouch(kind);
    }

    function react(kind, dir = 1) {
      if (TOUCH_BODY[kind]) doGesture(...TOUCH_BODY[kind]);
      if ((kind === 'pat' || kind === 'poke') && R.jolt) R.jolt(kind === 'pat' ? 30 : -20);
      if (kind === 'poke') { show('flinch', 500); kick(-dir * 260, -dir * 60); setTimeout(() => { show(sour() ? 'grumpy' : 'surprised', 900); }, 480); }
      else if (kind === 'boop') { show('surprised', 500); kick(0, 0, -40, -3); setTimeout(() => { show('blush', 1800); }, 480); }
      else if (kind === 'pat') { show(sour() ? 'suspicious' : 'joy', 1300); kick(0, 0, 90, -4); if (!sour()) emote('✨', 1000); }
      else if (kind === 'pet') { show(sour() ? 'blush' : 'joy', 700); }
      else if (kind === 'petEnd') { show('joy', 1500); emote('💗', 1500); }
      else if (kind === 'swat') { show('dizzy', 1300); kick(dir * 900, dir * 260, 0, 0); setTimeout(() => { show('angry', 2200); emote('💢', 2000); }, 1250); }
      else if (kind === 'body') { show('suspicious', 1500); emote('❓', 1200); kick(60); if (R.jolt) R.jolt(-40); }
      else if (kind === 'spam') { show('angry', 2600); emote('💢', 2400); kick(0, 0, 0, 5); }
      else if (kind === 'wave') { show('happy', 1800); kick(120); }
      else if (kind === 'laugh') { show('joy', 2000); kick(0, 0, 60); }
      else if (kind === 'stare') { show('suspicious', 2600); emote('💦', 1600); }
      else if (kind === 'gift') { show('excited', 2200); emote('✨', 1600); kick(0, 0, -70); }
    }

    // ---- touch: tap (where?), stroke over the hair (pet), fast swipe (swat) ----
    let down = null;
    const at = e => R.locate(e);
    // two fingers = pinch to zoom (renderers that can zoom); it never counts as a poke or a swat
    const fingers = new Map(); let pinch = 0, multi = false;
    const spread = () => { const [a, b] = [...fingers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    stage.addEventListener('wheel', e => { if (R.zoom && R.zoom(e.deltaY * 0.0015)) e.preventDefault(); }, { passive: false });
    const lift = e => { fingers.delete(e.pointerId); if (!fingers.size) setTimeout(() => { if (!fingers.size) multi = false; }, 250); };
    stage.addEventListener('pointerup', lift); stage.addEventListener('pointercancel', lift);
    stage.addEventListener('pointerdown', e => { fingers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (fingers.size === 2) { multi = true; down = null; pinch = spread(); } });
    stage.addEventListener('pointermove', e => {
      if (!fingers.has(e.pointerId)) return; fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fingers.size === 2 && R.zoom) { const d = spread(); if (pinch > 0) R.zoom((pinch - d) / Math.max(120, stage.clientWidth) * 1.6); pinch = d; }
    });
    const onHerAt = p => Math.abs(p.x - 100) < 70 && p.y > 28 && p.y < 480;
    stage.addEventListener('pointerdown', e => { if (multi) return; const p = at(e), inRoom = !!(R.fp && R.fp()); down = { ...p, sx: p.x, t: now(), path: 0, pet: 0, look: inRoom && !onHerAt(p), cx: e.clientX, cy: e.clientY, px: 0 };
      if (inRoom && document.activeElement && document.activeElement.blur) document.activeElement.blur();   // so the keys walk you instead of typing
      try { stage.setPointerCapture(e.pointerId); } catch {} e.preventDefault(); });
    stage.addEventListener('pointermove', e => {
      const p = at(e); pointerLook = { x: (p.x - 100) / 30, y: (p.y - 100) / 34 }; pointerLookUntil = now() + 1500;
      if (!down || multi) return;
      if (down.look) { const mx = e.clientX - down.cx, my = e.clientY - down.cy; down.cx = e.clientX; down.cy = e.clientY; down.px += Math.hypot(mx, my); if (down.px > 6) R.look(mx, my); return; } // visiting: dragging turns your head
      const d = Math.hypot(p.x - down.x, p.y - down.y); down.path += d;
      if (p.y < 92 && now() - down.t > 250) { down.pet += d; if (down.pet > 30) react('pet'); }
      down.x = p.x; down.y = p.y;
    });
    const up = e => {
      if (!down || multi) { down = null; return; } const p = at(e), d = down, ms = now() - d.t, dx = p.x - d.sx; down = null;
      const point = () => { const hit = R.pick(e); if (hit) { const what = R.direct(hit); if (what) { show('surprised', 500); doGesture('nod', 1.2); if (opts.onTouch) opts.onTouch(what); } } };
      if (d.look) { if (d.px <= 8 && R.pick) point(); return; }
      if (Math.abs(dx) > 55 && ms < 380) return touched('swat', Math.sign(dx));
      if (d.pet > 60) return touched('petEnd');
      if (d.path > 25) return;
      /* the small portrait: a tap opens the full view instead of poking her */
      if (opts.onPortraitTap && R.view && R.view() === 'portrait') { opts.onPortraitTap(); return; }
      // a tap that is not on her: it may be on something in her room, and then she goes and deals with it
      if (!onHerAt(p) && R.pick) { point(); return; }
      const t = now(); taps.push(t); while (taps.length && t - taps[0] > 2500) taps.shift();
      if (taps.length >= 4) { taps.length = 0; return touched('spam'); }
      if (Math.hypot(p.x - 100, p.y - 108) < 9) return touched('boop');
      if (p.y > 150) return touched('body');
      if (p.y < 80) return touched('pat');
      touched('poke', p.x < 100 ? -1 : 1);
    };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', () => { down = null; });

    // ---- the frame loop ----
    let last = now();
    function frame() {
      const t = now(), dt = Math.min(0.05, (t - last) / 1000); last = t;
      for (const k in sp) { const s = sp[k]; s.v += (-170 * s.x - 13 * s.v) * dt; s.x += s.v * dt; }
      irk *= Math.exp(-dt / 90); fond *= Math.exp(-dt / 120);
      const rest = irk >= 2.4 ? 'grumpy' : STATE[state] ? STATE[state][0] : fond >= 3 && irk < 1.5 ? 'happy' : mood;
      const faceName = (t < tempUntil && temp) || (thinking ? 'thinking' : rest);
      const face = FACE[faceName] || FACE.neutral;
      const talking = t < talkUntil;
      if (t > blinkAt) { blinkEnd = t + 130; blinkAt = t + 1800 + Math.random() * 4200; }
      const blink = t < blinkEnd && !['smile', 'squint', 'dizzy'].includes(face.lid);
      const lid = blink ? 'shut' : face.lid;
      const phase = (t / 130 | 0) % 3;
      const mouth = !talking ? face.mouth : voice != null ? (voice > 0.42 ? 'talk' : voice > 0.12 ? 'talk2' : face.mouth) : (phase === 0 ? face.mouth : phase === 1 ? 'talk' : 'talk2');
      // eyes: follow the pointer for a moment, else the expression's resting gaze, else a slow idle glance
      if (t > glanceAt) { gaze = Math.random() < 0.5 ? { x: 0, y: 0 } : { x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 2 }; glanceAt = t + 1500 + Math.random() * 3000; }
      const want = t < pointerLookUntil && pointerLook ? pointerLook : (face.gx || face.gy) ? { x: face.gx || 0, y: face.gy || 0 } : gaze;
      look.x += (Math.max(-3, Math.min(3, want.x)) - look.x) * Math.min(1, dt * 10); look.y += (Math.max(-3, Math.min(2.5, want.y)) - look.y) * Math.min(1, dt * 10);
      const breathe = Math.sin(t / 900), rot = sp.rot.x * 0.06 + (face.tilt || 0) + (talking ? Math.sin(t / 160) * 0.8 : 0);
      const tx = sp.tx.x * 0.06, ty = sp.ty.x * 0.06 + (face.drop || 0) + breathe * 0.7, sq = 1 - Math.max(-0.12, Math.min(0.12, sp.sq.x * 0.02));
      // a gesture in progress: name, seconds since it began, and an ease in/out weight 0..1
      // left alone for a while, she moves on her own
      if (!gesture && !talking && !thinking && t > idleAt && !(R.activity && R.activity())) { const shy = (face && face.blush > 0.3) || ['anxious', 'sad', 'tired'].includes(faceName), pool = STATE[state] ? STATE[state][1] : shy ? IDLE_SHY : IDLE; if (idleAt) { const pick = pool[Math.random() * pool.length | 0]; doGesture(pick[0], (pick[1] || 2.2) * (QUICK.has(pick[0]) ? 1 : 1.4)); } idleAt = t + (STATE[state] ? 14000 + Math.random() * 16000 : 28000 + Math.random() * 40000); }
      if ((talking || thinking) && idleAt < t + 25000) idleAt = t + 25000;   // while you two are talking she is with you, not fidgeting
      let g = null;
      if (gesture) { const gt = t - gesture.t0; if (gt > gesture.dur) gesture = null; else g = { name: gesture.name, t: gt / 1000, w: Math.min(1, gt / 350, (gesture.dur - gt) / 450) }; }
      try { R.draw({ t, dt, face, faceName, thinking, lid, blink, mouth, talking, phase, voice: talking ? voice : null, look, rot, tx, ty, sq, breathe, gesture: g }); } catch (e) { if (!frame.warned) { frame.warned = true; console.error('avatar draw', e); } }
      const eo = Math.max(0, Math.min(1, (emoteUntil - t) / 300)); em.style.opacity = eo; em.style.transform = `translateY(${(eo - 1) * 6}px)`;
      em.style.setProperty('--emote', Math.max(1, stage.clientWidth / 104));
      if (stage.isConnected) requestAnimationFrame(frame); else R.dispose();
    }
    requestAnimationFrame(frame);
    // a still picture of her face for the chat log, taken once she has been drawn
    function askThumb() { const mine = R; setTimeout(() => { if (R === mine && R.thumb && opts.onThumb) { try { R.thumb(opts.onThumb); } catch {} } }, 900); }
    askThumb();

    return {
      setMood(m) { mood = FACE[m] ? m : 'neutral'; },
      view(v) { if (R.setView) R.setView(v); return R.view ? R.view() : 'portrait'; },
      setThinking(b) { thinking = !!b; },
      // level: how loud her voice is right now (0..1) when the page knows; leave it out and her mouth just keeps time
      talk(level) { talkUntil = now() + 350; thinking = false; voice = typeof level === 'number' ? level : null; },
      feel(text) { text = String(text).slice(-140); for (const [re, face] of FEEL) if (re.test(text)) { show(face, 5000); return face; } return null; },
      react,
      // her finished reply: any action in it that is a gesture she can do gets done (the first one found)
      act(text) { text = String(text).split('\n').filter(l => !/^\s*[A-Z][A-Za-z'\- ]{1,22}?\s*:\s*["\u201c*]/.test(l) || /^\s*(wizra|she)\s*:/i.test(l)).join('\n');   /* a story character's line is theirs, not hers */
        for (const m of String(text).matchAll(/\*([^*]+)\*/g)) { const hit = ROUTINE.find(([re]) => re.test(m[1])); if (hit && R.doActivity) { R.doActivity(hit[1]); break; } }
        const found = [];
        for (const m of String(text).matchAll(/\*([^*]+)\*/g)) for (const [re, name, dur] of GEST) if (re.test(m[1])) { found.push([name, dur]); break; }
        for (const [re, name, dur] of EMOJI_GEST) if (re.test(String(text)) && !found.some(f => f[0] === name)) found.push([name, dur]);
        let wait = 0; for (const [name, dur] of found.slice(0, 2)) { const hold = dur * (QUICK.has(name) ? 1 : 1.5); setTimeout(() => doGesture(name, hold), wait); wait += hold * 1000 + 1200; }   // each pose is held, then a breath before the next
        return found.map(f => f[0]);
      },
      gesture: doGesture,
      // whether she is in the room: 'gone' (already out), 'leave' (walks out now), 'return' (walks back in; opts.sneak = quietly)
      presence(mode, o) { if (R.presence) R.presence(mode, o || {}); },
      // a video call while she is out: she appears wherever she really is (scene = the backdrop), until call(false)
      call(on, scene) { if (R.call) R.call(on, scene); },
      callShow() { if (R.callShow) R.callShow(); },
      hang(on) { if (R.hang) R.hang(on); }, hangView(o) { return R.hangView ? R.hangView(o) : {}; }, hangZone(e) { return R.hangZone ? R.hangZone(e) : null; }, hangMouth() { return R.hangMouth ? R.hangMouth() : null; },   // one-on-one time (hang.js)
      weather(kind) { if (R.weather) R.weather(kind); },
      movie(on, tint) { if (R.movie) R.movie(on, tint); }, movieMode(on, view) { return R.movieMode ? R.movieMode(on, view) : false; }, dndMode(on) { return R.dndMode ? R.dndMode(on) : false; }, dndSurprise() { if (R.dndSurprise) R.dndSurprise(); }, movieLook(dx, dy) { if (R.movieLook) R.movieLook(dx, dy); },                            // movie night: lights down, the screen lights the room
      power(on, ms) { if (R.power) R.power(on, ms); },                               // cut or restore the power (a storm does this by itself now and then)                              // the sky outside follows the player's real weather                                  // on a video call: she turns the phone to show where she is
      // the after-effect that still shows for a while once she is back: '', tipsy, high, groggy, hyper, upset
      setState(kind) { state = STATE[kind] ? kind : ''; if (R.glow) R.glow(state); },
      // her routine (3D model only): what she is busy with right now, in words, and a way to start something
      activity() { return R.activity ? R.activity() : ''; },
      // a posed picture of her (3D model only): resolves to an image URL, or '' if it cannot be drawn
      // scripted (the Studio's events): walk her somewhere (resolves true when she arrives), hold a recorded clip, and what is on offer
      walkTo(x, z) { return new Promise(ok => { if (R.walkTo) R.walkTo(x, z, ok); else ok(false); setTimeout(() => ok(false), 40000); }); },
      holdClip(name, s) { return R.holdClip ? R.holdClip(name, s) : false; }, emote, layout() { return R.layout ? R.layout() : null; }, lists() { return { clips: R.clips ? R.clips() : [], gestures: R.gestures ? R.gestures() : GEST.map(g => g[1]) }; },
      // the heart game: a passing face, a wriggle, the camera closing in on her heart, happy tears
      flash(face, ms) { show(face, ms || 1500); }, squirm(hard) { kick((Math.random() - 0.5) * 300, (Math.random() - 0.5) * 160, 60, hard ? -5 : -3); doGesture(Math.random() < 0.5 ? 'shift' : 'feet', 1.1); },
      focus(k) { if (R.focus) R.focus(k); }, heartPose(i) { if (R.heartPose) R.heartPose(i); }, heartStage(k) { if (R.heartStage) R.heartStage(k); }, bonus(on) { if (R.bonus) R.bonus(on); }, bonusShot() { if (R.bonusShot) R.bonusShot(); }, bonusOrbit(dx, dy, dz) { if (R.bonusOrbit) R.bonusOrbit(dx, dy, dz); }, bonusHit(e) { return R.bonusHit ? R.bonusHit(e) : 0; }, tears(on) { if (R.tears) R.tears(on); },
      snapshot(spec) { return R.snapshot ? R.snapshot(spec) : Promise.resolve(''); },
      // visiting in person (3D model only): 'dorm' or 'house' puts you in the room in first person, '' takes you home
      visit(name) { if (R.visit) R.visit(name || ''); return !!R.visit; }, canVisit() { return !!R.visit; },
      routine(name) { if (R.doActivity) R.doActivity(name); },
      // swap the picture live; null goes back to the cartoon
      setRenderer(r) { R.dispose(); if (r) stage.insertBefore(r.el, em); R = r || puppet(stage); stage.appendChild(em); askThumb(); if (R.glow) R.glow(state); if (opts.onRenderer) opts.onRenderer(); },
    };
  }
  window.CompanionAvatar = { mount };
})();
