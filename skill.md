---
name: changzheng-blink
description: |
  长征机"眨眼"技能——PC 感知驱动的主动截图分析方案。
  检测当前运行的应用（会议/WPS/视频/编程），主动询问用户是否需要协助，
  用户确认后调用 Claude Vision 截图分析屏幕内容。
  触发词：眨眼 / 帮我看看屏幕 / 截图分析
version: 1.0.0
author: 山而
tags: [vision, proactive, screenshot, wps, meeting, windows]
platform: windows
requires:
  - pc_sentinel.pyw (哨兵脚本，写入 pc-status.json)
  - Claude API Key (Vision 能力)
  - Node.js WebSocket 服务
---

# 眨眼技能

## 触发方式

### 主动感知触发（自动）
长征机检测到以下场景时自动询问：
- `腾讯会议/Zoom` 正在运行 → 询问录音
- `WPS文档` 打开 → 询问协助
- `B站/YouTube` 视频 → 询问总结
- `Claude Code` 等编程工具 → 询问截图协助

### 手动触发
用户直接说：
- "眨眼"
- "帮我看看这个页面"
- "截图分析一下"

## 响应流程

```
用户确认 → [WPS: 激活窗口] → 截图 → Claude Vision 分析 → 输出结果
                                                              ↓
                              用户翻页后说"继续" → 截第2张（最多3张）
```

## 核心 API

```javascript
// 单次眨眼
const { blinkOnce } = require('./lib/screen_vision');
const result = await blinkOnce(task, {
  forceSystem: true,    // WPS 等非浏览器场景
  screenIndex: 1,       // 第几张
  prevSummaries: [],    // 前几张的摘要（用于多屏上下文）
});
// result.content = Claude Vision 分析文本

// 多屏归档（电商等需要完整滚动的场景）
const { analyzeAndArchive } = require('./lib/screen_vision');
const result = await analyzeAndArchive(task, {
  scrollCount: 3,
  forceSystem: false,
  onProgress: (step, total, msg) => console.log(msg),
});
// result.files = [{ name, path }] 生成的 Word 文档
```

## 状态机

```
ws._proactivePending  → 主动问询待确认状态 { type, appKey, askedAt }
ws._blinkSession      → 眨眼续截会话状态   { task, forceSystem, summaries, count }
_probeDismissed       → Map<key, timestamp> 冷却记录（30分钟有效）
_probeLastKey         → 最近广播的问询 key（防重复）
```
