/**
 * 感知检测核心逻辑
 * 从 server.js 提取，供独立集成使用。
 *
 * 依赖：
 *   - getContext()      读取 pc-status.json
 *   - STATUS_FILE       pc-status.json 路径
 *   - _broadcastProactive(type, question, tts, key, askedAt)
 *   - _isDismissed(key) 检查是否在冷却期
 */

const fs = require('fs');

// ── 冷却管理 ─────────────────────────────────────────────────────────
const _probeDismissed  = new Map();   // key → dismissedAt 时间戳
const PROBE_DISMISS_MS = 30 * 60 * 1000; // 30 分钟

function _isDismissed(key) {
  const t = _probeDismissed.get(key);
  return t && (Date.now() - t) < PROBE_DISMISS_MS;
}

function dismiss(key) {
  _probeDismissed.set(key, Date.now());
}

// ── 解析 pc-status.json 的 detail 字段 ──────────────────────────────
// detail 可能是字符串（背景进程，如 "bg:wemeetapp"）或对象（前台进程）
function parseDetail(ctx) {
  const detailObj = typeof ctx.detail === 'object' && ctx.detail ? ctx.detail : {};
  const detailStr = typeof ctx.detail === 'string' ? ctx.detail : '';
  return {
    matchedBy: detailStr || detailObj.matched_by || '',
    fgProcess: detailObj.fg_process || ctx.foreground || '',
    fgWindow:  detailObj.fg_window  || ctx.fg_title   || '',
  };
}

// ── 根据上下文判断触发类型 ────────────────────────────────────────────
function detectTrigger(ctx) {
  const { matchedBy, fgProcess, fgWindow } = parseDetail(ctx);
  const mb = matchedBy.toLowerCase();
  const fp = fgProcess.toLowerCase();
  const fw = fgWindow.toLowerCase();

  // 腾讯会议 / Zoom / Teams
  if (ctx.status === 'meeting' && /wemeet|zoom|teams/i.test(mb + fp + fw)) {
    const name = /wemeet/i.test(mb + fp) ? '腾讯会议'
               : /zoom/i.test(mb + fp)   ? 'Zoom' : '视频会议';
    return {
      type: 'meeting',
      question: `山而，检测到${name}正在运行，需要我帮你录音，会后整理纪要吗？`,
      tts: `山而，检测到${name}，需要录音吗？`,
    };
  }

  // WPS / ET / WPP
  if (ctx.status === 'office' && /wps/i.test(mb + fp)) {
    return {
      type: 'document',
      question: '山而，你打开了WPS文档，需要我帮你处理吗？',
      tts: '山而，检测到WPS文档，需要帮忙吗？',
    };
  }

  return null;
}

// ── fs.watch 监听触发 ────────────────────────────────────────────────
let _probeLastKey  = '';
let _probeCooldown = 0;
let _lastStatusKey = '';

function watchProactiveTrigger(STATUS_FILE, getContext, broadcastFn) {
  fs.watch(STATUS_FILE, async () => {
    try {
      const ctx = await getContext();
      if (!ctx || ctx.status === 'unknown') return;

      const now         = Date.now();
      const COOLDOWN_MS = 90_000;
      if (now - _probeCooldown < COOLDOWN_MS) return;

      const { matchedBy, fgProcess } = parseDetail(ctx);
      const statusKey = `${ctx.status}:${matchedBy}`;
      if (statusKey === _lastStatusKey) return;
      _lastStatusKey = statusKey;

      const trigger = detectTrigger(ctx);
      if (!trigger) return;

      const probeKey = `probe:${trigger.type}`;
      if (_isDismissed(probeKey) || _probeLastKey === probeKey) return;

      _probeCooldown = now;
      _probeLastKey  = probeKey;
      broadcastFn(trigger.type, trigger.question, trigger.tts, probeKey, now);
    } catch (e) {
      console.warn('[主动感知-watch] 失败:', e.message);
    }
  });
}

// ── 新连接时立即检查 ──────────────────────────────────────────────────
async function checkOnConnect(ws, getContext, sendFn, sendTTSFn) {
  await new Promise(r => setTimeout(r, 1500));
  if (ws.readyState !== 1) return;

  try {
    const ctx = await getContext();
    if (!ctx || ctx.status === 'unknown') return;
    if (ws._proactivePending) return;

    const trigger = detectTrigger(ctx);
    if (!trigger) return;

    const key = `probe:${trigger.type}`;
    if (_isDismissed(key)) return;

    ws.send(JSON.stringify({ type: 'text', content: `长征机: ${trigger.question}` }));
    ws._proactivePending = { type: trigger.type, appKey: key, askedAt: Date.now() };
    await sendTTSFn(trigger.tts);
  } catch (e) {
    console.warn('[主动感知-连接] 失败:', e.message);
  }
}

module.exports = { watchProactiveTrigger, checkOnConnect, detectTrigger, dismiss, _isDismissed };
