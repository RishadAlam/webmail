# Assessment B — detector and technical browser evidence

Date: 2026-11-01. Reviewer: independent Assessment B subagent. Source HEAD: `1b73af3d675d6e6bf3030e75d4b089321ebdbe35`. Target: `resources/js/pages`, `resources/js/components`, `resources/js/layouts`; existing local application at `http://localhost:8082`.

Assessment A was not read, consulted, or exchanged. This report contains technical evidence only. No source changes, dependency installs, asset builds, shared test suites, external services, DNS changes, account preference changes, mailbox mutations, or recovery-code use were performed. Login used the designated fictional member. Browser request guards rejected non-GET/HEAD/OPTIONS application requests after login; the completed runs recorded **zero attempted mutations and zero page errors**. An already-read fictional conversation (`fixture-4`) was viewed; unread conversations were avoided because the controller changes read state on GET.

## Deterministic detector

Pinned Impeccable **3.8.0** was reviewed before execution. The entrypoint, facade, CLI dispatch, regex implementation, imports and side-effect searches were inspected. Its local-file JSON path reads the supplied tree and does not launch the browser/network path. All **96 files** in `docs/impeccable-pin.json` matched their SHA-256 values. Relevant entrypoint hash: `f5dfd05ca1e314acd8ed79c6301a20a1b844f2eb6691bd63e04116a8e7efb187`.

Executed:

```bash
rtk proxy env IMPECCABLE_NO_UPDATE_CHECK=1 /tmp/postroom-node/node_modules/node/bin/node /home/rishadalam/.codex/plugins/cache/personal/impeccable/3.8.0/skills/impeccable/scripts/context.mjs --target resources/js/pages
rtk proxy /tmp/postroom-node/node_modules/node/bin/node /home/rishadalam/.codex/plugins/cache/personal/impeccable/3.8.0/skills/impeccable/scripts/detect.mjs --json resources/js/pages resources/js/components resources/js/layouts
```

Context loader: exit 0; resolved root PRODUCT.md and DESIGN.md, register `product`. Update checking was explicitly disabled to preserve the reviewed pin and avoid network/cache side effects.

Detector: **exit 0, exact JSON `[]`, 0 findings, 0 rule names/file locations, 0 detector false positives**. Scan included 74 source files: pages 9, components 56, layouts 9. This was a markup/component scan, not a CSS-only scan. No project detector config/local config/critique ignore file existed. A clean regex scan does not establish contrast, focus, responsive, or accessibility conformance.

## Browser scope and execution

Chromium **156.0.8078.4**, Playwright installed locally, headless fresh isolated context. No user tab or persisted browser profile was reused. Existing locally built assets were exercised; no build was run.

- Inbox widths: **320, 360, 390, 430, 768, 1024, 1440** CSS px.
- Login: 1440 and 320 px; settings Profile, Appearance and password-confirmation at 1440/390/320 px.
- Conversation: already-read `fixture-4` at 320/1440 px.
- Mobile drawer/account sheet; desktop and mobile quick settings; search-options sheet.
- Keyboard Tab order, Enter to open, Escape to close, focus containment/restoration.
- Computed text/background measurements in light and settled dark presentation.
- 200% text emulation at 320 px, with computed font size and line height doubled for elements while leaving the root rem size unchanged. This is text-only stress emulation, **not physical-device testing or browser-native zoom certification**. An earlier supplemental variant also doubled the root size; only the `textonly200` captures support the final scaling findings.

### CSP and axe/overlay

The response used `script-src 'self' 'nonce-…'`, with no overlay exception. Preflight successfully changed/restored the document title, but a newly appended inline script did **not execute**; Chromium logged a CSP rejection. Loading installed axe-core using normal `page.addScriptTag({ path: … })` was also rejected by CSP. No nonce reuse, bypassCSP, response-header changes, alternate execution-world injection, or security weakening was attempted.

**No reliable live Impeccable overlay exists. No browser detector findings or axe result are claimed.** The overlay server was not started because the script execution preflight failed. Read-only computed DOM/style measurements, screenshots, ARIA snapshots and real keyboard interactions provided the fallback evidence.

## Confirmed findings

### B1 — P1: settings selected-navigation contrast fails in both themes

At 320 px light, the active “Profile” / “Appearance” text is `rgb(31,31,31)` on `rgb(84,91,102)`: **2.41:1** at 13.125 px. At 1440 px dark, active “Profile” is `rgb(232,236,242)` on `rgb(177,187,200)`: **1.64:1** at 12.25 px. Both are opaque colors, so these readings do not depend on alpha compositing.

Cause: the global mail token `--muted` is a text color, while Tailwind `--color-muted: var(--muted)` expects a surface color. Settings uses `bg-muted` for the active item. Source: `resources/css/postroom.css` token block, `resources/css/app.css` theme aliases, `resources/js/layouts/settings/layout.tsx:54`.

Fix: separate mail text/surface tokens from the component theme vocabulary and apply paired foreground/background tokens. Recheck active, hover and focus states across shared settings/auth components.

Additional opaque light-theme readings: Appearance’s inactive Light/Dark labels on neutral-100 measure **4.35:1**; Profile’s warning copy on red-50 measures **4.36:1**. Both fall below the normal-text 4.5:1 threshold. These are secondary to the selected-navigation failure.

Evidence: [profile 320](evidence-b/settings-profile-320.png), [profile dark](evidence-b/settings-profile-dark.png), [appearance 320](evidence-b/settings-appearance-320.png). Threshold reference: [W3C contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

### B2 — P1: 200% text exposes horizontal overflow and fixed-height control crowding

At a 320 px viewport, doubling text and line height while keeping the root rem size unchanged produces:

| Surface               | Document width | Reproduced problem                                                                                                                               |
| --------------------- | -------------: | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inbox                 |         320 px | No global overflow; message truncation retains its conversation-opening path                                                                     |
| Profile               |         320 px | Settings links stay 30 px tall while text scroll height reaches 34 px; Save/Delete controls stay about 34 px tall for roughly 39 px text content |
| Appearance            |     **375 px** | Non-wrapping inline-flex theme switch overflows the viewport                                                                                     |
| Password confirmation |     **355 px** | “Confirm with passkey” becomes approximately 332 px wide inside a 275 px content column                                                          |

The Appearance and password-confirmation failures are visible in the screenshots. The fixed control heights also produce crowded text/boundaries. These are concrete stress-test failures; a full browser-native zoom conformance verdict was not attempted.

Fix: allow preference choices and authentication actions to wrap/reflow, use min-height instead of fixed-height controls, and preserve padding when text grows. Relevant sources: `components/appearance-tabs.tsx:23`, `components/ui/button.tsx:24-25`, `components/ui/input.tsx:11`, `layouts/settings/layout.tsx`, `pages/auth/confirm-password.tsx`.

Evidence: [appearance text-only 200%](evidence-b/settings-appearance-320-textonly200.png), [authentication text-only 200%](evidence-b/settings-security-320-textonly200.png), [profile text-only 200%](evidence-b/settings-profile-320-textonly200.png), [inbox text-only 200%](evidence-b/inbox-320-textonly200.png). Reference: [W3C resize text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html).

### B3 — P2: closing controlled sheets loses the invoking control’s focus

Reproduced with keyboard-only opening:

1. Focus Quick settings; press Enter.
2. Tab 20 times: focus remains inside the dialog (**pass**).
3. Escape closes the dialog (**pass**).
4. `document.activeElement` is **BODY**, not the Quick settings button (**fail**).

The mobile navigation drawer also closes on Escape to **BODY**. Source `components/postroom/ui.tsx` uses a controlled Radix Dialog without a Trigger or explicit close-focus restoration.

Fix: capture the invoker or use Dialog.Trigger; restore focus on close and retain logical fallback behavior if the invoker disappears. Evidence is in the exact focused browser harness/result below. Reference: [W3C dialog keyboard behavior](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

### B4 — P2: settings/auth use a second component and theme system

The same fictional session shows **Light** selected in Mail → Quick settings and **System** selected in Settings → Appearance. Source confirms independent state:

- Mail initializes from `defaultPreferences.theme = 'light'` plus server user preferences, applies its own document class and persists via `PUT /preferences`.
- `use-appearance.tsx` defaults to System and independently reads/writes localStorage/cookies and the document class.
- The appearance toggle is a set of plain buttons without `aria-pressed` / radio selection state; the ARIA snapshot announces no selected mode. Mail’s theme choices do have `aria-pressed`.

No preference was changed to test persistence. The inconsistent visible selected values and separate stores are confirmed; cross-route persistence consequences remain an inference from source.

The security route redirects to a password-confirmation page with the **Laravel logo**, generic starter styling and a home link named “Confirm password”, while login/mail/settings use Postroom’s envelope identity. This breaks continuity at a sensitive authentication step. See `layouts/auth/auth-simple-layout.tsx`, `components/app-logo-icon.tsx`, and the screenshot. The requested WebMail by Hookstack identity should be applied to this route too.

Fix: one user preference source and accessible selection semantics; use the same branded auth shell for login, MFA and step-up authentication.

Evidence: [quick settings](evidence-b/quick-settings-desktop.png), [appearance](evidence-b/settings-appearance-320.png), [password confirmation](evidence-b/settings-security-320.png).

### B5 — P2: mobile settings and secondary mail targets miss the product’s 48 px default

Measured at 320/390 px:

| Target                                             | Measured size                      |
| -------------------------------------------------- | ---------------------------------- |
| Mail star/unstar                                   | 40 × 40 px                         |
| Mail All / Unread filters                          | 44 px high; All about 46.6 px wide |
| Settings Profile/Security/Appearance links         | 30 px high                         |
| Settings inputs and Save                           | about 33.8 px high                 |
| Authentication passkey, password, confirm controls | about 33.8 px high                 |
| Show-password icon                                 | about 37.5 × 33.8 px               |
| Login Sign in                                      | 46 px high                         |

Settings and password-confirmation inputs also compute to **15 px** on mobile, below the project’s 16 px editable-field default. Inbox primary navigation/account actions and the Compose action are larger; the problem is uneven component coverage.

These are **product-contract misses**, not an assertion that WCAG requires 48 px. Enlarge hit areas and use the shared mobile control sizing consistently. Parent screenshots under `evidence-b/` show the measured surfaces.

## Verified strengths and non-findings

- The inbox document width equals the viewport at all seven required widths. Phone layout is genuinely single-column; no forced three-pane layout.
- Login and ordinary-size Profile/Appearance/password-confirmation fit 320 px without global horizontal overflow.
- Inbox text-only 200% remains within 320 px; sender/subject/snippet truncation opens into a full conversation.
- Sampled normal light inbox text pairs had no failures; settled dark inbox pairs also had none. This is sampled evidence, not a full visual-state certification.
- Desktop Tab order begins Skip to mail → navigation → brand → search → search options → help → settings → account → Compose → folders. Most sampled controls have a 2 px accent focus outline.
- Search input’s own outline is suppressed, but the search container uses a focus-within visual treatment; do not report the zero input outline alone as an invisible-focus failure.
- Dialog focus containment and Escape dismissal work. Restoration is the specific defect.
- The member UI exposes no Admin link. Admin workflows were not entered.
- The UI explicitly identifies local fictional mail; no live-provider claim was inferred.

## False positives and excluded evidence

1. The geometry probe sees descendant `row-snippet` boxes extend beyond the viewport at 768/1024/1440 px. They are clipped within their row parent with intentional truncation; the document width remains correct. **Not a global overflow defect.**
2. Measuring immediately after switching the DOM dark class gave low-contrast row colors during the 140 ms background transition. A settled 400 ms measurement returned **zero inbox text failures**. The initial `inbox-desktop-dark.png` is a transition capture; use `inbox-desktop-dark-settled.png`.
3. The simple color probe does not composite translucent ancestor backgrounds accurately. It reported dark warning-copy failures against a 10% alpha surface; those are **excluded**, not confirmed contrast defects. Opaque selected-navigation readings remain valid.
4. Measurements list visible controls behind a modal overlay; those rows are not evidence of an interactive background or focus trap failure.
5. The first root-and-text scaling trial also doubled rem spacing. Final resize findings rely on the subsequent root-preserving `textonly200` trial.

## Skipped or unavailable

- Impeccable browser overlay and axe: CSP blocked normal script injection; no bypass.
- Full compose/reply/send/archive/swipe/undo/save/profile mutation flows: outside this read-only subtask. Opening compose creates a draft, so it was deliberately not clicked.
- Security controls behind password reauthentication: the gate was viewed; no reauthentication submission, MFA change, passkey registration or recovery-code consumption.
- Administrator screens: only the designated member account was authorized.
- Firefox/WebKit, physical iOS/Android, software keyboard, actual safe areas, installed PWA, native zoom, screen-reader software, offline update/logout/account-switch flows: **not run in Assessment B**.
- Real provider delivery, deployment, free-tier capacity and DNS: **not tested**. This report does not establish production readiness.

## Command results and operational notes

All shell commands began with `rtk`. No `npx`, package installation or shared test/build command was used.

| Command / operation                                                                                                                      | Actual result                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `rtk read /home/rishadalam/.codex/RTK.md`, repository guidance, pinned skill/references, specified project docs and focused source reads | Read successfully; some broad terminal output was truncated and narrower reads were used                                                      |
| `rtk proxy python3 - <<'PY'` SHA-256 manifest verification                                                                               | Exit 0; 96 checked, no mismatches                                                                                                             |
| Pinned context command above                                                                                                             | Exit 0; product register resolved                                                                                                             |
| Pinned detector command above                                                                                                            | Exit 0; exact JSON `[]`                                                                                                                       |
| First sandboxed Chromium harness                                                                                                         | Exit 1 at Chromium startup: sandbox host `Operation not permitted`; no page opened                                                            |
| Same isolated browser outside execution sandbox                                                                                          | Browser launched; login/CSP probe succeeded; harness mistakenly waited for `**/mail/**` when route was `/mail`. Stopped with Ctrl-C; exit 130 |
| Initial matrix attempt                                                                                                                   | Exit 1: harness assumed old Inertia `#app[data-page]` format. No product failure; current Inertia uses `script[data-page=\"app\"]`            |
| Second matrix attempt                                                                                                                    | Exit 1: direct X-Inertia request without correct version had an empty/non-JSON response. No product failure                                   |
| Corrected full browser harness below                                                                                                     | Exit 0; zero attempted post-login mutations, zero page errors                                                                                 |
| Focused keyboard/scaling/settled-theme harness below                                                                                     | Exit 0; zero attempted post-login mutations, zero page errors                                                                                 |
| `rtk proxy rg ... resources/js/hooks/use-mail*`                                                                                          | Exit 1 because the shell glob did not match; corrected explicit paths afterward                                                               |
| `rtk proxy rg ... resources/js/contexts ...`                                                                                             | Exit 2 for nonexistent contexts directory; returned relevant matches from existing explicit files                                             |
| Config/ignore/file-count Python read                                                                                                     | Exit 0; all three config/ignore paths absent; 9 + 56 + 9 files                                                                                |
| `rtk git rev-parse HEAD`                                                                                                                 | Exit 0; `1b73af3d675d6e6bf3030e75d4b089321ebdbe35`                                                                                            |

No local application server was started or stopped by Assessment B. Every browser instance created by the completed harnesses was closed. There is no retained overlay server.

## Exact successful browser commands

These inline harnesses are preserved here to make the evidence reproducible without adding scripts to the repository. They were executed from `/home/rishadalam/Sites/webmail`. The credential is the explicitly authorized local fictional fixture credential.

### Full baseline harness

```bash
rtk proxy /tmp/postroom-node/node_modules/node/bin/node - <<'JS'

const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:960},colorScheme:'light'});const page=await context.newPage();page.setDefaultTimeout(6000);page.setDefaultNavigationTimeout(15000);
 const blocked=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const measure=async(label)=>{const result=await page.evaluate(()=>{
  const vis=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight;};
  const name=e=>(e.getAttribute('aria-label')||e.textContent||e.getAttribute('name')||e.tagName).trim().replace(/\s+/g,' ').slice(0,80);
  const controls=[...document.querySelectorAll('button,a,input,select,[role="button"]')].filter(vis).filter(e=>!e.disabled&&!(e.matches('input[type="checkbox"]')&&e.closest('label'))).map(e=>{const r=e.getBoundingClientRect();return {name:name(e),w:+r.width.toFixed(1),h:+r.height.toFixed(1),cls:e.className};});
  const overflow=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return vis(e)&&!e.classList.contains('skip-link')&&(r.right>innerWidth+1||r.left< -1);}).slice(0,8).map(e=>({tag:e.tagName,cls:e.className,name:name(e)}));
  const canvas=document.createElement('canvas');const ctx=canvas.getContext('2d');function rgb(c){ctx.fillStyle='#000';ctx.fillStyle=c;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3)};function lum(c){return rgb(c).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0)};
  const pairs=new Map();for(const e of [...document.querySelectorAll('body *')].filter(vis)){if(![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))continue;const s=getComputedStyle(e);if(s.opacity==='0')continue;let p=e,bg;while(p){const c=getComputedStyle(p).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent'){bg=c;break}p=p.parentElement}if(!bg)bg='white';const L1=lum(s.color),L2=lum(bg),ratio=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);const large=parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.66&&Number(s.fontWeight)>=700);const key=[s.color,bg,s.fontSize,s.fontWeight].join('|');if(!pairs.has(key))pairs.set(key,{color:s.color,bg,font:s.fontSize,weight:s.fontWeight,ratio:+ratio.toFixed(2),required:large?3:4.5,text:name(e)});}
  return {url:location.pathname,viewport:innerWidth,docWidth:document.documentElement.scrollWidth,dark:document.documentElement.classList.contains('dark'),overflow,smallControls:controls.filter(x=>x.w<48||x.h<48).slice(0,12),contrastFailures:[...pairs.values()].filter(x=>x.ratio<x.required),contrastPairs:[...pairs.values()].length};
 });console.log(label+' '+JSON.stringify(result));};
 const shot=async(label)=>page.screenshot({path:'docs/review/evidence-b/'+label+'.png',fullPage:true});
 const scaleText=async()=>page.evaluate(()=>{const els=[document.documentElement,...document.querySelectorAll('body,body *')];const sizes=els.map(e=>{const s=getComputedStyle(e);return [e,parseFloat(s.fontSize),s.lineHeight]});for(const [e,size,line]of sizes){if(!(e instanceof HTMLElement))continue;e.style.fontSize=(size*2)+'px';if(line!=='normal')e.style.lineHeight=(parseFloat(line)*2)+'px';}});
 try{
 await page.goto('http://localhost:8082/login');await page.getByLabel('Email address').fill('mira@postroom.test');await page.getByLabel('Password',{exact:true}).fill('postroom-local-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(/\/mail(?:\/|\?|$)/);await page.goto('http://localhost:8082/mail');await page.getByRole('textbox',{name:'Search mail',exact:true}).waitFor();
 await context.route('**/*',async route=>{const req=route.request();if(!['GET','HEAD','OPTIONS'].includes(req.method())){blocked.push(req.method()+' '+new URL(req.url()).pathname);await route.abort();}else await route.continue();});
 const props=await page.evaluate(()=>{const s=document.querySelector('script[data-page="app"]');return s?JSON.parse(s.textContent).props:null});const read=props?.messages?.find(m=>m.is_read);console.log('FIXTURE '+JSON.stringify({mailbox:props?.mailbox?.id,messageCount:props?.messages?.length,alreadyRead:read?{thread:read.thread_id,subject:read.subject}:null}));
 for(const width of [320,360,390,430,768,1024,1440]){await page.setViewportSize({width,height:960});await measure('inbox-'+width);if([320,390,768,1440].includes(width))await shot('inbox-'+width+'-light');}
 try{await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});console.log('AXE '+JSON.stringify(await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}));})));}catch(e){console.log('AXE_UNAVAILABLE '+e.message.split('\n')[0]);}
 console.log('INBOX_SNAPSHOT '+await page.locator('body').ariaSnapshot());
 await page.getByRole('button',{name:'Quick settings',exact:true}).click();await measure('quick-settings-1440');await shot('quick-settings-desktop');await page.keyboard.press('Escape');console.log('QUICK_SETTINGS_ESCAPE '+JSON.stringify(await page.evaluate(()=>({dialog:!!document.querySelector('[role="dialog"]'),focus:document.activeElement.getAttribute('aria-label')||document.activeElement.tagName}))));
 await page.getByRole('button',{name:'Search options',exact:true}).click();await measure('search-options-1440');await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Open navigation',exact:true}).filter({visible:true}).click();await measure('drawer-390');await shot('drawer-390');let inside=true;for(let i=0;i<18;i++){await page.keyboard.press('Tab');inside=inside&&await page.evaluate(()=>!!document.activeElement.closest('[role="dialog"]'));}await page.keyboard.press('Escape');console.log('DRAWER_KEYBOARD '+JSON.stringify({focusTrap:inside,...await page.evaluate(()=>({dialog:!!document.querySelector('[role="dialog"]'),focus:document.activeElement.getAttribute('aria-label')||document.activeElement.tagName}))}));
 await page.getByRole('button',{name:/Account and mailboxes/}).filter({visible:true}).click();await measure('account-390');await shot('account-390');await page.keyboard.press('Escape');
 await page.setViewportSize({width:320,height:800});await scaleText();await measure('inbox-320-text200');await shot('inbox-320-text200');await page.goto('http://localhost:8082/mail');
 if(read){await page.goto('http://localhost:8082/mail/'+props.mailbox.id+'/thread/'+read.thread_id);await measure('already-read-thread-320');await shot('read-thread-320');await page.setViewportSize({width:1440,height:960});await measure('already-read-thread-1440');await shot('read-thread-1440');}
 for(const route of ['profile','appearance','security']){await page.goto('http://localhost:8082/settings/'+route);await page.locator('h1').waitFor({state:'attached'});console.log('SETTINGS_SNAPSHOT_'+route+' '+await page.locator('body').ariaSnapshot());for(const width of [1440,390,320]){await page.setViewportSize({width,height:960});await measure(route+'-'+width);if(width!==390)await shot('settings-'+route+'-'+width);}await scaleText();await measure(route+'-320-text200');await shot('settings-'+route+'-320-text200');}
 await page.goto('http://localhost:8082/mail');await page.setViewportSize({width:1440,height:960});await page.emulateMedia({colorScheme:'dark'});await page.evaluate(()=>document.documentElement.classList.add('dark'));await measure('inbox-dark-simulation');await shot('inbox-desktop-dark');await page.getByRole('button',{name:'Quick settings',exact:true}).click();await measure('quick-settings-dark-simulation');await shot('quick-settings-dark');
 console.log('FINAL '+JSON.stringify({browser:browser.version(),blockedMutations:blocked,pageErrors:errors}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});

JS
```

### Focused confirmation harness

```bash
rtk proxy /tmp/postroom-node/node_modules/node/bin/node - <<'JS'

const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:960},colorScheme:'light'});const page=await context.newPage();page.setDefaultTimeout(6000);page.setDefaultNavigationTimeout(15000);
 const blocked=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const measure=async(label)=>{const result=await page.evaluate(()=>{
  const vis=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight;};
  const name=e=>(e.getAttribute('aria-label')||e.textContent||e.getAttribute('name')||e.tagName).trim().replace(/\s+/g,' ').slice(0,80);
  const controls=[...document.querySelectorAll('button,a,input,select,[role="button"]')].filter(vis).filter(e=>!e.disabled&&!(e.matches('input[type="checkbox"]')&&e.closest('label'))).map(e=>{const r=e.getBoundingClientRect();return {name:name(e),w:+r.width.toFixed(1),h:+r.height.toFixed(1)};});
  const overflow=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return vis(e)&&!e.classList.contains('skip-link')&&(r.right>innerWidth+1||r.left< -1);}).slice(0,8).map(e=>({tag:e.tagName,cls:e.className,name:name(e)}));
  const canvas=document.createElement('canvas');const ctx=canvas.getContext('2d');function rgb(c){ctx.fillStyle='#000';ctx.fillStyle=c;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3)};function lum(c){return rgb(c).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0)};
  const pairs=new Map();for(const e of [...document.querySelectorAll('body *')].filter(vis)){if(![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))continue;const s=getComputedStyle(e);if(s.opacity==='0')continue;let p=e,bg;while(p){const c=getComputedStyle(p).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent'){bg=c;break}p=p.parentElement}if(!bg)bg='white';const L1=lum(s.color),L2=lum(bg),ratio=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);const large=parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.66&&Number(s.fontWeight)>=700);const key=[s.color,bg,s.fontSize,s.fontWeight].join('|');if(!pairs.has(key))pairs.set(key,{color:s.color,bg,font:s.fontSize,weight:s.fontWeight,ratio:+ratio.toFixed(2),required:large?3:4.5,text:name(e)});}
  return {url:location.pathname,viewport:innerWidth,docWidth:document.documentElement.scrollWidth,dark:document.documentElement.classList.contains('dark'),overflow,smallControls:controls.filter(x=>x.w<48||x.h<48).slice(0,8),contrastFailures:[...pairs.values()].filter(x=>x.ratio<x.required),contrastPairs:[...pairs.values()].length};
 });console.log(label+' '+JSON.stringify(result));};
 const shot=async(label)=>page.screenshot({path:'docs/review/evidence-b/'+label+'.png',fullPage:true});
 const scaleText=async()=>page.evaluate(()=>{const els=[...document.querySelectorAll('body,body *')];const sizes=els.map(e=>{const s=getComputedStyle(e);return [e,parseFloat(s.fontSize),s.lineHeight]});for(const [e,size,line]of sizes){if(!(e instanceof HTMLElement))continue;e.style.fontSize=(size*2)+'px';if(line!=='normal')e.style.lineHeight=(parseFloat(line)*2)+'px';}});

 try{
 await page.goto('http://localhost:8082/login');await page.getByLabel('Email address').fill('mira@postroom.test');await page.getByLabel('Password',{exact:true}).fill('postroom-local-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(/\/mail(?:\/|\?|$)/);await page.goto('http://localhost:8082/mail');await page.getByRole('textbox',{name:'Search mail',exact:true}).waitFor();
 await context.route('**/*',async route=>{const req=route.request();if(!['GET','HEAD','OPTIONS'].includes(req.method())){blocked.push(req.method()+' '+new URL(req.url()).pathname);await route.abort();}else await route.continue();});
 const tabOrder=[];for(let i=0;i<16;i++){await page.keyboard.press('Tab');tabOrder.push(await page.evaluate(()=>{const e=document.activeElement,s=getComputedStyle(e);return {name:e.getAttribute('aria-label')||e.textContent.trim().slice(0,80)||e.tagName,outline:s.outlineStyle+' '+s.outlineWidth+' '+s.outlineColor};}));}console.log('TAB_ORDER '+JSON.stringify(tabOrder));
 await page.getByRole('button',{name:'Quick settings',exact:true}).focus();await page.keyboard.press('Enter');let trapped=true;for(let i=0;i<20;i++){await page.keyboard.press('Tab');trapped=trapped&&await page.evaluate(()=>!!document.activeElement.closest('[role="dialog"]'));}await page.keyboard.press('Escape');console.log('QUICK_FOCUS '+JSON.stringify({trapped,...await page.evaluate(()=>({dialog:!!document.querySelector('[role="dialog"]'),focus:document.activeElement.getAttribute('aria-label')||document.activeElement.tagName}))}));
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Open navigation',exact:true}).filter({visible:true}).focus();await page.keyboard.press('Enter');await measure('drawer-390');await page.keyboard.press('Escape');console.log('DRAWER_FOCUS '+JSON.stringify(await page.evaluate(()=>({dialog:!!document.querySelector('[role="dialog"]'),focus:document.activeElement.getAttribute('aria-label')||document.activeElement.tagName}))));
 await page.getByRole('button',{name:/Account and mailboxes/}).filter({visible:true}).click();await measure('account-390');await page.keyboard.press('Escape');await page.getByRole('button',{name:'Quick settings',exact:true}).click();await measure('quick-settings-390');await page.keyboard.press('Escape');
 await page.setViewportSize({width:320,height:800});await scaleText();await measure('inbox-320-textonly200');await shot('inbox-320-textonly200');
 for(const route of ['profile','appearance','security']){await page.goto('http://localhost:8082/settings/'+route);await page.locator('h1').waitFor({state:'attached'});await measure(route+'-320');console.log('TEXTDETAIL_'+route+' '+JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('p,button,input,nav a')].filter(e=>e.getBoundingClientRect().height>0).map(e=>({text:(e.getAttribute('aria-label')||e.textContent||e.name||'').trim().slice(0,60),font:getComputedStyle(e).fontSize,color:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor,height:+e.getBoundingClientRect().height.toFixed(1)})))));await scaleText();await measure(route+'-320-textonly200');await shot('settings-'+route+'-320-textonly200');console.log('CLIPPED_'+route+' '+JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('button,a')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1)}).map(e=>({text:e.textContent.trim().slice(0,60),w:e.clientWidth,sw:e.scrollWidth,h:e.clientHeight,sh:e.scrollHeight})))));}
 await page.goto('http://localhost:8082/mail');await page.setViewportSize({width:1440,height:960});await page.evaluate(()=>document.documentElement.classList.add('dark'));await page.waitForTimeout(400);await measure('inbox-dark-settled');await shot('inbox-desktop-dark-settled');await page.goto('http://localhost:8082/settings/profile');await page.evaluate(()=>document.documentElement.classList.add('dark'));await page.waitForTimeout(400);await measure('profile-dark-settled');await shot('settings-profile-dark');
 console.log('FINAL '+JSON.stringify({browser:browser.version(),blockedMutations:blocked,pageErrors:errors}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
JS
```

### Exact focused confirmation output

```text
TAB_ORDER [{"name":"Skip to mail","outline":"solid 2px rgb(11, 87, 208)"},{"name":"Open navigation","outline":"solid 2px rgb(11, 87, 208)"},{"name":"Postroom inbox","outline":"solid 2px rgb(11, 87, 208)"},{"name":"Search mail","outline":"none 3px rgb(31, 31, 31)"},{"name":"Search options","outline":"solid 2px rgb(11, 87, 208)"},{"name":"Help and installation","outline":"solid 2px rgb(11, 87, 208)"},{"name":"Quick settings","outline":"solid 2px rgb(11, 87, 208)"},{"name":"MC · Account and mailboxes","outline":"solid 2px rgb(11, 87, 208)"},{"name":"Compose","outline":"solid 2px rgb(11, 87, 208)"},{"name":"Inbox3","outline":"solid 2px rgb(11, 87, 208)"},{"name":"Starred","outline":"solid 2px rgb(11, 87, 208)"},{"name":"Sent","outline":"solid 2px rgb(11, 87, 208)"},{"name":"Drafts","outline":"solid 2px rgb(11, 87, 208)"},{"name":"Archive","outline":"solid 2px rgb(11, 87, 208)"},{"name":"Spam","outline":"solid 2px rgb(11, 87, 208)"},{"name":"Trash","outline":"solid 2px rgb(11, 87, 208)"}]
QUICK_FOCUS {"trapped":true,"dialog":false,"focus":"BODY"}
drawer-390 {"url":"/mail","viewport":390,"docWidth":390,"dark":false,"overflow":[],"smallControls":[{"name":"All","w":46.6,"h":44},{"name":"Unread","w":72.6,"h":44},{"name":"Unstar message","w":40,"h":40},{"name":"Star message","w":40,"h":40},{"name":"Unstar message","w":40,"h":40},{"name":"Star message","w":40,"h":40},{"name":"Star message","w":40,"h":40},{"name":"Star message","w":40,"h":40}],"contrastFailures":[],"contrastPairs":27}
DRAWER_FOCUS {"dialog":false,"focus":"BODY"}
account-390 {"url":"/mail","viewport":390,"docWidth":390,"dark":false,"overflow":[],"smallControls":[{"name":"All","w":46.6,"h":44},{"name":"Unread","w":72.6,"h":44},{"name":"Unstar message","w":40,"h":40},{"name":"Star message","w":40,"h":40},{"name":"Unstar message","w":40,"h":40},{"name":"Star message","w":40,"h":40},{"name":"Star message","w":40,"h":40},{"name":"Star message","w":40,"h":40}],"contrastFailures":[],"contrastPairs":26}
quick-settings-390 {"url":"/mail","viewport":390,"docWidth":390,"dark":false,"overflow":[],"smallControls":[{"name":"All","w":46.6,"h":44},{"name":"Unread","w":72.6,"h":44},{"name":"Unstar message","w":40,"h":40},{"name":"Star message","w":40,"h":40},{"name":"Unstar message","w":40,"h":40},{"name":"Star message","w":40,"h":40},{"name":"Star message","w":40,"h":40},{"name":"Star message","w":40,"h":40}],"contrastFailures":[],"contrastPairs":21}
inbox-320-textonly200 {"url":"/mail","viewport":320,"docWidth":320,"dark":false,"overflow":[],"smallControls":[{"name":"Unstar message","w":40,"h":40},{"name":"Star message","w":40,"h":40},{"name":"Unstar message","w":40,"h":40},{"name":"Star message","w":40,"h":40}],"contrastFailures":[],"contrastPairs":16}
profile-320 {"url":"/settings/profile","viewport":320,"docWidth":320,"dark":false,"overflow":[],"smallControls":[{"name":"Back to mail","w":120.4,"h":44},{"name":"Profile","w":258,"h":30},{"name":"Security","w":258,"h":30},{"name":"Appearance","w":258,"h":30},{"name":"name","w":258,"h":33.8},{"name":"email","w":258,"h":33.8},{"name":"Save","w":64.2,"h":33.8}],"contrastFailures":[{"color":"rgb(31, 31, 31)","bg":"rgb(84, 91, 102)","font":"13.125px","weight":"500","ratio":2.41,"required":4.5,"text":"Profile"},{"color":"oklch(0.577 0.245 27.325)","bg":"oklch(0.971 0.013 17.38)","font":"15px","weight":"500","ratio":4.36,"required":4.5,"text":"Warning"},{"color":"oklch(0.577 0.245 27.325)","bg":"oklch(0.971 0.013 17.38)","font":"13.125px","weight":"400","ratio":4.36,"required":4.5,"text":"Please proceed with caution, this cannot be undone."}],"contrastPairs":10}
TEXTDETAIL_profile [{"text":"Manage your profile and account settings","font":"13.125px","color":"oklch(0.556 0 0)","bg":"rgba(0, 0, 0, 0)","height":21},{"text":"Profile","font":"13.125px","color":"rgb(31, 31, 31)","bg":"rgb(84, 91, 102)","height":30},{"text":"Security","font":"13.125px","color":"rgb(31, 31, 31)","bg":"rgba(0, 0, 0, 0)","height":30},{"text":"Appearance","font":"13.125px","color":"rgb(31, 31, 31)","bg":"rgba(0, 0, 0, 0)","height":30},{"text":"Update your name and email address","font":"13.125px","color":"oklch(0.556 0 0)","bg":"rgba(0, 0, 0, 0)","height":21},{"text":"name","font":"15px","color":"rgb(31, 31, 31)","bg":"rgba(0, 0, 0, 0)","height":33.8},{"text":"email","font":"15px","color":"rgb(31, 31, 31)","bg":"rgba(0, 0, 0, 0)","height":33.8},{"text":"Save","font":"15px","color":"oklch(0.985 0 0)","bg":"oklch(0.205 0 0)","height":33.8},{"text":"Delete your account and all of its resources","font":"13.125px","color":"oklch(0.556 0 0)","bg":"rgba(0, 0, 0, 0)","height":21},{"text":"Warning","font":"15px","color":"oklch(0.577 0.245 27.325)","bg":"rgba(0, 0, 0, 0)","height":24},{"text":"Please proceed with caution, this cannot be undone.","font":"13.125px","color":"oklch(0.577 0.245 27.325)","bg":"rgba(0, 0, 0, 0)","height":42},{"text":"Delete account","font":"15px","color":"rgb(255, 255, 255)","bg":"oklch(0.577 0.245 27.325)","height":33.8}]
profile-320-textonly200 {"url":"/settings/profile","viewport":320,"docWidth":320,"dark":false,"overflow":[],"smallControls":[{"name":"Profile","w":258,"h":30},{"name":"Security","w":258,"h":30},{"name":"Appearance","w":258,"h":30},{"name":"name","w":258,"h":33.8},{"name":"email","w":258,"h":33.8}],"contrastFailures":[{"color":"rgb(31, 31, 31)","bg":"rgb(84, 91, 102)","font":"26.25px","weight":"500","ratio":2.41,"required":3,"text":"Profile"}],"contrastPairs":7}
CLIPPED_profile [{"text":"Profile","w":258,"sw":258,"h":30,"sh":34},{"text":"Security","w":258,"sw":258,"h":30,"sh":34},{"text":"Appearance","w":258,"sw":258,"h":30,"sh":34},{"text":"Save","w":98,"sw":98,"h":34,"sh":39},{"text":"Delete account","w":230,"sw":230,"h":34,"sh":39}]
appearance-320 {"url":"/settings/appearance","viewport":320,"docWidth":320,"dark":false,"overflow":[],"smallControls":[{"name":"Back to mail","w":120.4,"h":44},{"name":"Profile","w":258,"h":30},{"name":"Security","w":258,"h":30},{"name":"Appearance","w":258,"h":30},{"name":"Light","w":71.6,"h":30},{"name":"Dark","w":70.8,"h":30},{"name":"System","w":86.8,"h":30}],"contrastFailures":[{"color":"rgb(31, 31, 31)","bg":"rgb(84, 91, 102)","font":"13.125px","weight":"500","ratio":2.41,"required":4.5,"text":"Appearance"},{"color":"oklch(0.556 0 none)","bg":"oklch(0.97 0 none)","font":"13.125px","weight":"400","ratio":4.35,"required":4.5,"text":"Light"}],"contrastPairs":9}
TEXTDETAIL_appearance [{"text":"Manage your profile and account settings","font":"13.125px","color":"oklch(0.556 0 0)","bg":"rgba(0, 0, 0, 0)","height":21},{"text":"Profile","font":"13.125px","color":"rgb(31, 31, 31)","bg":"rgba(0, 0, 0, 0)","height":30},{"text":"Security","font":"13.125px","color":"rgb(31, 31, 31)","bg":"rgba(0, 0, 0, 0)","height":30},{"text":"Appearance","font":"13.125px","color":"rgb(31, 31, 31)","bg":"rgb(84, 91, 102)","height":30},{"text":"Update the appearance settings for your account","font":"13.125px","color":"oklch(0.556 0 0)","bg":"rgba(0, 0, 0, 0)","height":42},{"text":"Light","font":"15px","color":"oklch(0.556 0 none)","bg":"rgba(0, 0, 0, 0)","height":30},{"text":"Dark","font":"15px","color":"oklch(0.556 0 none)","bg":"rgba(0, 0, 0, 0)","height":30},{"text":"System","font":"15px","color":"rgb(31, 31, 31)","bg":"rgb(255, 255, 255)","height":30}]
appearance-320-textonly200 {"url":"/settings/appearance","viewport":320,"docWidth":375,"dark":false,"overflow":[{"tag":"DIV","cls":"inline-flex gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800","name":"LightDarkSystem"},{"tag":"BUTTON","cls":"flex items-center rounded-md px-3.5 py-1.5 transition-colors bg-white shadow-xs dark:bg-neutral-700 dark:text-neutral-100","name":"System"},{"tag":"SPAN","cls":"ml-1.5 text-sm","name":"System"}],"smallControls":[{"name":"Profile","w":258,"h":30},{"name":"Security","w":258,"h":30},{"name":"Appearance","w":258,"h":30}],"contrastFailures":[{"color":"rgb(31, 31, 31)","bg":"rgb(84, 91, 102)","font":"26.25px","weight":"500","ratio":2.41,"required":3,"text":"Appearance"}],"contrastPairs":9}
CLIPPED_appearance [{"text":"Profile","w":258,"sw":258,"h":30,"sh":34},{"text":"Security","w":258,"sw":258,"h":30,"sh":34},{"text":"Appearance","w":258,"sw":258,"h":30,"sh":34}]
security-320 {"url":"/user/confirm-password","viewport":320,"docWidth":320,"dark":false,"overflow":[],"smallControls":[{"name":"Confirm password","w":33.8,"h":37.5},{"name":"Confirm with passkey","w":275,"h":33.8},{"name":"password","w":275,"h":33.8},{"name":"Show password","w":37.5,"h":33.8},{"name":"Confirm password","w":275,"h":33.8}],"contrastFailures":[],"contrastPairs":7}
TEXTDETAIL_security [{"text":"This is a secure area of the application. Please confirm you","font":"13.125px","color":"oklch(0.556 0 0)","bg":"rgba(0, 0, 0, 0)","height":42},{"text":"Confirm with passkey","font":"15px","color":"rgb(31, 31, 31)","bg":"oklch(1 0 0)","height":33.8},{"text":"password","font":"15px","color":"rgb(31, 31, 31)","bg":"rgba(0, 0, 0, 0)","height":33.8},{"text":"Show password","font":"15px","color":"oklch(0.556 0 0)","bg":"rgba(0, 0, 0, 0)","height":33.8},{"text":"Confirm password","font":"15px","color":"oklch(0.985 0 0)","bg":"oklch(0.205 0 0)","height":33.8}]
security-320-textonly200 {"url":"/user/confirm-password","viewport":320,"docWidth":355,"dark":false,"overflow":[{"tag":"BUTTON","cls":"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,box-shadow] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 has-[>svg]:px-3 w-full","name":"Confirm with passkey"}],"smallControls":[{"name":"Confirm password","w":33.8,"h":37.5},{"name":"Confirm with passkey","w":332.1,"h":33.8},{"name":"password","w":275,"h":33.8},{"name":"Show password","w":37.5,"h":33.8},{"name":"Confirm password","w":275,"h":33.8}],"contrastFailures":[],"contrastPairs":7}
CLIPPED_security [{"text":"Confirm with passkey","w":330,"sw":330,"h":32,"sh":38},{"text":"Confirm password","w":275,"sw":275,"h":34,"sh":39}]
inbox-dark-settled {"url":"/mail","viewport":1440,"docWidth":1440,"dark":true,"overflow":[{"tag":"SPAN","cls":"row-snippet","name":"Morning Mira, Here’s a little breathing room for next week. Let’s keep Monday fo"},{"tag":"SPAN","cls":"row-snippet","name":"Long-content layout fixture. Nothing here is real customer correspondence."}],"smallControls":[{"name":"Open navigation","w":36,"h":36},{"name":"Postroom inbox","w":136.8,"h":34.5},{"name":"Search options","w":36,"h":36},{"name":"Help and installation","w":36,"h":36},{"name":"Quick settings","w":36,"h":36},{"name":"MC · Account and mailboxes","w":36,"h":36},{"name":"Inbox3","w":230,"h":37},{"name":"Starred","w":230,"h":37}],"contrastFailures":[],"contrastPairs":21}
profile-dark-settled {"url":"/settings/profile","viewport":1440,"docWidth":1440,"dark":true,"overflow":[],"smallControls":[{"name":"Back to mail","w":149.3,"h":41},{"name":"Profile","w":168,"h":28},{"name":"Security","w":168,"h":28},{"name":"Appearance","w":168,"h":28},{"name":"name","w":504,"h":31.5},{"name":"email","w":504,"h":31.5},{"name":"Save","w":59.9,"h":31.5},{"name":"Delete account","w":121.4,"h":31.5}],"contrastFailures":[{"color":"rgb(232, 236, 242)","bg":"rgb(177, 187, 200)","font":"12.25px","weight":"500","ratio":1.64,"required":4.5,"text":"Profile"},{"color":"oklch(0.936 0.032 17.717)","bg":"oklab(0.505 0.188902 0.0984118 / 0.1)","font":"14px","weight":"500","ratio":1.2,"required":4.5,"text":"Warning"},{"color":"oklch(0.936 0.032 17.717)","bg":"oklab(0.505 0.188902 0.0984118 / 0.1)","font":"12.25px","weight":"400","ratio":1.2,"required":4.5,"text":"Please proceed with caution, this cannot be undone."}],"contrastPairs":11}
FINAL {"browser":"156.0.8078.4","blockedMutations":[],"pageErrors":[]}

```
