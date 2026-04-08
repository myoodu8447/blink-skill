# 👁️ Blink Skill · 让你的 AI 学会「眨眼」观察你的电脑

> **Teach your AI to blink — watch your screen, understand your context, help without being asked.**  
> 低成本获得 AI 主动协助功能：感知你在做什么 → 主动问你需不需要帮忙 → 截图 → Claude Vision 分析 → 给出协助。

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Windows-blue)](https://www.microsoft.com/windows)
[![Claude Vision](https://img.shields.io/badge/Powered%20by-Claude%20Vision-orange)](https://anthropic.com)

**一个眨眼，AI 就知道你在做什么。**  
不需要你主动描述，不需要截图发给它——它自己看，自己问，自己帮。

---

## ✨ What is Blink? 什么是「眨眼」？

Most AI assistants are **reactive** — they wait for you to describe your situation, paste content, or upload screenshots. That's friction.

**Blink** removes that friction. It's a proactive AI skill that watches your PC activity via a lightweight Python sentinel, and when it detects you're in a meeting, working on a document, watching a video, or coding — it reaches out and asks if you need help. One screenshot is all it takes.

> 大多数 AI 助手是被动的——你得描述情况、粘贴内容、上传截图。  
> 眨眼省掉了这一切：AI 自己看，自己问，一张截图，直接协助。

```
PC Sentinel watches your screen (Python, 1s interval)
        ↓
Detects: Tencent Meeting / WPS doc / Bilibili video / Claude Code
        ↓
AI asks proactively: "Hey, want me to help with that?"
        ↓
You say: "Yes" / "帮我整理一下" / "Summarize this"
        ↓
Blink takes ONE screenshot → Claude Vision analyzes it
        ↓
Result: meeting notes / document analysis / video summary / code review
        ↓
Need more? Scroll manually → say "继续" → up to 3 screenshots total
```

---

## 🚀 Demo

| Scenario | What Blink Does |
|----------|----------------|
| 🎥 Tencent Meeting opens | "Want me to record and summarize the meeting?" |
| 📄 WPS document opens | "Want me to help with this document?" → screenshots & analyzes it |
| 🎬 Bilibili/YouTube video | "Want me to summarize this video?" |
| 💻 Claude Code / Codex active | "Want a screenshot analysis of your coding context?" |

---

## 📐 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Windows PC                           │
│                                                             │
│  pc_sentinel.pyw ──writes──▶ pc-status.json (every 1s)    │
│  (Python watcher)            { status, detail, foreground } │
└──────────────────────────────┬──────────────────────────────┘
                               │ fs.watch / poll
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   Node.js WebSocket Server                   │
│                                                             │
│  ┌─────────────────┐    ┌──────────────────────────────┐   │
│  │ Proactive Layer │    │      Blink Engine            │   │
│  │                 │    │                              │   │
│  │ fs.watch detects│───▶│ blinkOnce(task, opts)        │   │
│  │ meeting / WPS / │    │  ├─ CDP screenshot (browser) │   │
│  │ video / coding  │    │  └─ PowerShell screenshot    │   │
│  │                 │    │      (WPS / system)          │   │
│  │ _proactiveOn    │    │                              │   │
│  │  Connect()      │    │ analyzeAndArchive(task, opts)│   │
│  └─────────────────┘    │  └─ multi-screen + Word doc  │   │
│                         └──────────────┬─────────────────┘  │
│                                        │ axios POST          │
└────────────────────────────────────────┼────────────────────┘
                                         ▼
                              ┌──────────────────┐
                              │  Claude Vision   │
                              │  API (Anthropic) │
                              └──────────────────┘
                                         │
                              ┌──────────▼─────────┐
                              │  Browser UI / TTS  │
                              │  (WebSocket client) │
                              └────────────────────┘
```

---

## 📁 Project Structure

```
changzheng-blink/
├── README.md                        # This file
├── LICENSE                          # MIT
├── skill.md                         # Claude Code skill manifest
└── snippets/
    ├── screen_vision.js             # Core: screenshot + Claude Vision
    ├── proactive-detection.js       # Core: PC state detection + proactive trigger
    └── blink-functions.js           # Core: blink session management
```

### Integration into 长征机 (`pc-server/`)

The full server integration lives in the main Changzheng repo:

```
pc-server/
├── server.js                        # WebSocket server + routing
│   ├── fs.watch(STATUS_FILE)        # ← proactive trigger (background apps)
│   ├── _proactiveOnConnect(ws)      # ← trigger on new connection
│   ├── _broadcastProactive(...)     # ← send question to all clients
│   ├── _blinkStart(ws, ...)         # ← start a blink session
│   └── _blinkContinue(ws, ...)      # ← handle "继续" for next screenshot
└── lib/
    └── screen_vision.js             # ← screenshot + Vision (same as snippets/)
```

---

## 🛠️ Setup

### Prerequisites

- **Windows 10/11** (screenshot uses PowerShell)
- **Node.js 18+**
- **Python 3.8+** (for `pc_sentinel.pyw`)
- **Claude API Key** ([get one here](https://console.anthropic.com))
- Chrome/Edge browser (optional, for CDP-based browser screenshots)

### Install

```bash
npm install ws axios docx
```

### 1. Run the PC Sentinel

The sentinel watches active windows and writes state every second:

```bash
python pc_sentinel.pyw
# Writes to: ~/.openclaw/workspace/pc-status.json
```

`pc-status.json` format:
```json
{
  "status": "meeting",
  "detail": "bg:wemeetapp",
  "foreground": "msedge",
  "fg_title": "My Browser - Microsoft Edge",
  "idle_seconds": 0,
  "updated_at": "2026-04-08T14:30:00"
}
```

Possible `status` values: `meeting`, `office`, `browsing`, `coding`, `video`, `unknown`

### 2. Integrate into your WebSocket server

```javascript
const screenVision = require('./snippets/screen_vision');
const { watchProactiveTrigger, checkOnConnect } = require('./snippets/proactive-detection');
const { startBlink, handleBlinkContinue } = require('./snippets/blink-functions');

// Watch for proactive triggers
watchProactiveTrigger(STATUS_FILE, getContext, broadcastProactive);

// On new WebSocket connection
wss.on('connection', (ws) => {
  checkOnConnect(ws, getContext, sendFn, sendTTSFn);
});

// In your message router (highest priority)
async function routeMessage(ws, text) {
  // 1. Check for blink continuation
  const continued = await handleBlinkContinue(ws, text, { send, sendTTS, addHistory, reply });
  if (continued) return;

  // 2. Check for proactive confirmation/denial
  if (ws._proactivePending) {
    if (DENY_RE.test(text))    { /* dismiss */ return; }
    if (/* isConfirm */ true)  { await startBlink(ws, text, { send, sendTTS, addHistory }); return; }
  }

  // 3. Normal routing...
}
```

---

## ⚙️ Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `BLINK_MAX` | `3` | Maximum screenshots per session |
| `PROBE_DISMISS_MS` | `30 min` | Cooldown after user dismissal |
| `forceSystem` | `false` | Use PowerShell screenshot instead of CDP |
| `scrollCount` | `5` | Screens for `analyzeAndArchive` (multi-page) |

---

## 🔑 Key State Variables

```javascript
// Per-connection (on ws object)
ws._proactivePending  // { type, appKey, askedAt } — pending proactive question
ws._blinkSession      // { task, forceSystem, summaries[], count } — active blink session

// Global
_probeDismissed       // Map<key, timestamp> — 30-min cooldown per app
_probeLastKey         // string — last broadcast key (dedup)
_probeCooldown        // number — timestamp of last broadcast
```

---

## 🧠 How Proactive Detection Works

```javascript
// pc-status.json is watched for changes
fs.watch(STATUS_FILE, async () => {
  const ctx = await getContext();

  // Parse detail (can be string or object depending on detection method)
  // String: "bg:wemeetapp" (background process)
  // Object: { matched_by, fg_process, fg_window } (foreground process)
  const { matchedBy, fgProcess } = parseDetail(ctx);

  // Detect trigger type
  if (ctx.status === 'meeting' && /wemeet|zoom/i.test(matchedBy + fgProcess)) {
    // → ask about recording
  } else if (ctx.status === 'office' && /wps/i.test(matchedBy + fgProcess)) {
    // → ask about document help
  }

  // Use unified key format: "probe:meeting", "probe:document"
  const key = `probe:${triggerType}`;
  if (!_isDismissed(key)) broadcastProactive(...);
});
```

---

## 📸 Screenshot Methods

| Method | Used For | How |
|--------|----------|-----|
| **CDP** (Chrome DevTools Protocol) | Browser tabs | `chrome.tabs.captureVisibleTab` via CDP |
| **PowerShell EncodedCommand** | WPS, system-wide | `System.Drawing.Graphics.CopyFromScreen` via Base64-encoded PS |

> PowerShell commands are Base64-encoded as UTF-16LE to avoid quoting issues and AMSI false positives.

---

## 🔄 Blink Session Flow

```
User confirms help
      │
      ▼
[WPS? → AppActivate WPS window]
      │
      ▼
blinkOnce(task, { forceSystem })
      │
      ▼
Claude Vision analyzes screenshot
      │
      ▼
Output: "【第1张截图分析】..."
      │
      ▼
"翻页后说继续可以再看一屏 (max 3)"
      │
User scrolls manually
      │
User says: "继续" / "下一页" / "好了"
      │
      ▼
blinkOnce(task, { screenIndex: 2, prevSummaries: [...] })
      │
      ▼
Output: "【第2张截图分析】..."  (new content only)
```

---

## 🤝 Contributing

PRs welcome! Key areas for improvement:

- [ ] macOS support (replace PowerShell with `screencapture`)  
- [ ] Auto-scroll for WPS (currently manual due to window focus issues)
- [ ] More trigger apps (Slack, Notion, VSCode)
- [ ] Voice confirmation (STT integration)

---

## 📄 License

MIT © 2026 山而

---

## 👥 Contributors

| | Name | Role |
|---|------|------|
| 🧑‍💻 | **ZHANG Tianrui** ([@zhangtianruiwork-droid](https://github.com/zhangtianruiwork-droid)) | Creator · Architecture · Integration |
| 🤖 | **Claude** (Anthropic) | Co-developer · Code generation · Vision analysis |

Built as part of **长征机 (Changzheng)** — a personal AI assistant that runs 24/7 on Windows, powered by Claude + DeepSeek.
