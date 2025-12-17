(function () {
  'use strict';

  const VideoApp = (window.VideoApp = window.VideoApp || {});
  const state = (VideoApp.state = VideoApp.state || {});

  let bound = false;
  let shortcutHintTimer = null;

  function isTypingInInput() {
    const el = document.activeElement;
    if (!el) return false;
    if (el.id === 'search') return true;
    const tag = (el.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return !!el.isContentEditable;
  }

  function isVideoLoaded() {
    if (!state.player || !state.currentVideoId) return false;
    if (typeof state.player.readyState === 'function' && state.player.readyState() < 1) return false;
    return true;
  }

  function showShortcutHint(text) {
    try {
      const container = document.getElementById('player-container');
      if (!container || container.style.display === 'none') return;

      let hint = document.getElementById('shortcut-hint');
      if (!hint) {
        hint = document.createElement('div');
        hint.id = 'shortcut-hint';
        hint.style.position = 'absolute';
        hint.style.left = '50%';
        hint.style.bottom = '16px';
        hint.style.transform = 'translateX(-50%)';
        hint.style.padding = '6px 10px';
        hint.style.background = 'rgba(0, 0, 0, 0.65)';
        hint.style.color = '#fff';
        hint.style.borderRadius = '6px';
        hint.style.fontSize = '13px';
        hint.style.lineHeight = '1.2';
        hint.style.zIndex = '9999';
        hint.style.pointerEvents = 'none';
        hint.style.opacity = '0';
        hint.style.transition = 'opacity 120ms ease-in-out';
        container.style.position = container.style.position || 'relative';
        container.appendChild(hint);
      }

      hint.textContent = text;
      hint.style.opacity = '1';
      if (shortcutHintTimer) clearTimeout(shortcutHintTimer);
      shortcutHintTimer = setTimeout(() => {
        hint.style.opacity = '0';
      }, 900);
    } catch (e) {
      console.warn('快捷键提示显示失败:', e);
    }
  }

  function clamp01(v) {
    if (!Number.isFinite(v)) return 0;
    return Math.min(1, Math.max(0, v));
  }

  function safeGetCurrentTime() {
    const player = state.player;
    if (!player || typeof player.currentTime !== 'function') return 0;
    try {
      const t = Number(player.currentTime());
      return Number.isFinite(t) ? t : 0;
    } catch (e) {
      return 0;
    }
  }

  function safeSetCurrentTime(seconds) {
    const player = state.player;
    if (!player || typeof player.currentTime !== 'function') return;
    const duration = typeof player.duration === 'function' ? player.duration() : NaN;
    let target = seconds;
    if (Number.isFinite(duration) && duration > 0) {
      target = Math.min(Math.max(0, target), Math.max(0, duration - 0.1));
    } else {
      target = Math.max(0, target);
    }
    try {
      player.currentTime(target);
    } catch (e) {
      console.warn('跳转失败:', e);
    }
  }

  function bindPlayerShortcuts() {
    if (bound) return;
    bound = true;

    window.addEventListener(
      'keydown',
      (e) => {
        if (!isVideoLoaded()) return;
        if (isTypingInInput()) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        const player = state.player;
        if (!player) return;

        const key = e.key;
        const code = e.code;

        const handled = (() => {
          if (code === 'Space') {
            if (e.repeat) return true;
            try {
              if (player.paused()) {
                const p = player.play();
                if (p && typeof p.catch === 'function') p.catch(() => {});
                showShortcutHint('播放');
              } else {
                player.pause();
                showShortcutHint('暂停');
              }
            } catch (err) {
              console.warn('播放/暂停失败:', err);
            }
            return true;
          }

          if (key === 'ArrowLeft') {
            safeSetCurrentTime(safeGetCurrentTime() - 5);
            showShortcutHint('后退 5 秒');
            return true;
          }
          if (key === 'ArrowRight') {
            safeSetCurrentTime(safeGetCurrentTime() + 5);
            showShortcutHint('前进 5 秒');
            return true;
          }

          if (key === 'ArrowUp') {
            try {
              const next = clamp01((player.volume() || 0) + 0.1);
              player.volume(next);
              if (typeof player.muted === 'function' && player.muted() && next > 0) player.muted(false);
              showShortcutHint(`音量 ${Math.round(next * 100)}%`);
            } catch (err) {
              console.warn('音量调整失败:', err);
            }
            return true;
          }
          if (key === 'ArrowDown') {
            try {
              const next = clamp01((player.volume() || 0) - 0.1);
              player.volume(next);
              showShortcutHint(`音量 ${Math.round(next * 100)}%`);
            } catch (err) {
              console.warn('音量调整失败:', err);
            }
            return true;
          }

          if (typeof key === 'string' && key.length === 1) {
            const lower = key.toLowerCase();
            if (lower === 'f') {
              if (e.repeat) return true;
              try {
                if (typeof player.isFullscreen === 'function' && player.isFullscreen()) {
                  player.exitFullscreen();
                  showShortcutHint('退出全屏');
                } else {
                  player.requestFullscreen();
                  showShortcutHint('进入全屏');
                }
              } catch (err) {
                console.warn('全屏切换失败:', err);
              }
              return true;
            }
            if (lower === 'm') {
              if (e.repeat) return true;
              try {
                const next = !(typeof player.muted === 'function' && player.muted());
                player.muted(next);
                showShortcutHint(next ? '静音' : '取消静音');
              } catch (err) {
                console.warn('静音切换失败:', err);
              }
              return true;
            }
          }

          if (key >= '0' && key <= '9') {
            const duration = typeof player.duration === 'function' ? player.duration() : NaN;
            if (!Number.isFinite(duration) || duration <= 0) return false;
            const digit = Number(key);
            const percent = digit * 10;
            safeSetCurrentTime(duration * (percent / 100));
            showShortcutHint(`跳转到 ${percent}%`);
            return true;
          }

          return false;
        })();

        if (!handled) return;
        e.preventDefault();
        e.stopPropagation();
      },
      { capture: true }
    );
  }

  VideoApp.Shortcuts = {
    bindPlayerShortcuts,
  };
})();

