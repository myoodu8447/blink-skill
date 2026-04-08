/**
 * 眨眼功能：单次截图 + Vision 分析，支持手动翻页续截
 *
 * 集成到你的 WebSocket 路由层：
 *   1. 在消息路由最前面调用 handleBlinkContinue()
 *   2. 在主动感知确认后调用 startBlink()
 */

const { blinkOnce } = require('./screen_vision'); // 路径按实际调整
const BLINK_MAX = 3;

// ── 启动眨眼 ──────────────────────────────────────────────────────────
async function startBlink(ws, task, opts = {}) {
  const { forceSystem = false, send, sendTTS, addHistory } = opts;

  const ackMsg = forceSystem ? '好，眨眼看一下WPS文档，稍等…' : '好，眨眼看一下屏幕，稍等…';
  send({ type: 'text', content: `长征机: ${ackMsg}` });
  addHistory('assistant', ackMsg);
  await sendTTS(ackMsg);

  // WPS / 非浏览器场景：先激活目标窗口
  if (forceSystem) await activateWPS();

  send({ type: 'task_start', taskType: 'blink', taskText: task });

  try {
    const result = await blinkOnce(task, { forceSystem });

    send({ type: 'text', content: `长征机: 【第1张截图分析】\n${result.content}` });
    addHistory('assistant', `【第1张截图分析】\n${result.content}`);

    // 保存会话，支持续截
    ws._blinkSession = { task, forceSystem, summaries: [result.content], count: 1 };

    const hint = `如需查看下一页，请手动翻页后说"继续"（最多再截${BLINK_MAX - 1}张）。`;
    send({ type: 'text', content: `长征机: ${hint}` });
    await sendTTS('分析完毕，需要继续看下一页请说继续。');
  } catch (e) {
    send({ type: 'text', content: `长征机: 眨眼失败：${e.message.substring(0, 80)}` });
  }
}

// ── 续截（用户翻页后） ────────────────────────────────────────────────
const BLINK_CONTINUE_RE = /^(继续|下一页|翻页了|好了|继续截|再截|看下一页|next)([吧啊哦]?)$/i;

async function handleBlinkContinue(ws, text, opts = {}) {
  if (!BLINK_CONTINUE_RE.test(text.trim())) return false;
  const sess = ws._blinkSession;
  if (!sess) return false;

  const { send, sendTTS, addHistory, reply } = opts;

  if (sess.count >= BLINK_MAX) {
    ws._blinkSession = null;
    reply(`已截满${BLINK_MAX}张，眨眼会话结束。`);
    return true;
  }

  const next = sess.count + 1;
  send({ type: 'text', content: `长征机: 好，眨眼看第${next}张，稍等…` });

  if (sess.forceSystem) await activateWPS();

  send({ type: 'task_start', taskType: 'blink', taskText: sess.task });

  try {
    const result = await blinkOnce(sess.task, {
      forceSystem: sess.forceSystem,
      screenIndex: next,
      prevSummaries: sess.summaries,
    });

    sess.summaries.push(result.content);
    sess.count = next;

    send({ type: 'text', content: `长征机: 【第${next}张截图分析】\n${result.content}` });
    addHistory('assistant', `【第${next}张截图分析】\n${result.content}`);

    if (next >= BLINK_MAX) {
      ws._blinkSession = null;
      const doneMsg = `已截完${BLINK_MAX}张，眨眼结束。需要我整理成文档吗？`;
      send({ type: 'text', content: `长征机: ${doneMsg}` });
      await sendTTS(doneMsg);
    } else {
      send({ type: 'text', content: `长征机: 如需继续，翻到下一页后说"继续"（还可再截${BLINK_MAX - next}张）。` });
    }
  } catch (e) {
    send({ type: 'text', content: `长征机: 眨眼失败：${e.message.substring(0, 80)}` });
  }
  return true;
}

// ── 激活 WPS 窗口 ────────────────────────────────────────────────────
async function activateWPS() {
  try {
    const { execSync } = require('child_process');
    const ps = `$p=Get-Process wps,et,wpp -ErrorAction SilentlyContinue|Where-Object{$_.MainWindowHandle -ne 0}|Select-Object -First 1;if($p){$sh=New-Object -ComObject WScript.Shell;$sh.AppActivate($p.Id)|Out-Null}`;
    const enc = Buffer.from(ps, 'utf16le').toString('base64');
    execSync(`powershell -NoProfile -EncodedCommand ${enc}`, { timeout: 3000 });
    await new Promise(r => setTimeout(r, 600));
  } catch {}
}

module.exports = { startBlink, handleBlinkContinue, BLINK_CONTINUE_RE, BLINK_MAX };
