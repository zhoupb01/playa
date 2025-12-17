(function () {
  'use strict';

  const VideoApp = (window.VideoApp = window.VideoApp || {});
  const state = (VideoApp.state = VideoApp.state || {});

  if (!('allVideos' in state)) state.allVideos = [];
  if (!('player' in state)) state.player = null;
  if (!('currentVideoId' in state)) state.currentVideoId = null;
  if (!('currentHls' in state)) state.currentHls = null;

  let progressTimer = null;
  let progressVideoId = null;
  let progressEndedHandler = null;
  let pendingResumeHandler = null;
  let playHistoryMarked = false;
  let playHistoryMarkedVideoId = null;

  const PROGRESS_SAVE_INTERVAL_MS = 2500;
  const PROGRESS_MIN_SECONDS = 5;
  const PROGRESS_DONE_RATIO = 0.95;

  const PLAY_HISTORY_STORAGE_KEY = 'video.playHistory';
  const PLAY_HISTORY_VERSION = 1;
  const PLAY_HISTORY_MAX_ITEMS = 5000;
  const PLAY_HISTORY_EVENT_UPDATED = 'videoapp:playhistory:updated';
  const PLAY_HISTORY_EVENT_CLEARED = 'videoapp:playhistory:cleared';

  let playHistoryCache = null;

  function getProgressKey(videoId) {
    return String(videoId);
  }

  function getPlayer() {
    return state.player;
  }

  function safeParseJson(raw) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function normalizePlayHistory(parsed) {
    const empty = { version: PLAY_HISTORY_VERSION, ids: [], lastPlayedAtById: {} };
    if (!parsed || typeof parsed !== 'object') return empty;

    const version = Number(parsed.version);
    const ids = Array.isArray(parsed.ids) ? parsed.ids : [];
    const lastPlayedAtById =
      parsed.lastPlayedAtById && typeof parsed.lastPlayedAtById === 'object' ? parsed.lastPlayedAtById : {};

    const out = { version: Number.isFinite(version) ? version : PLAY_HISTORY_VERSION, ids: [], lastPlayedAtById: {} };
    const seen = new Set();

    for (const id of ids) {
      const videoId = String(id);
      if (!videoId || seen.has(videoId)) continue;
      const ts = Number(lastPlayedAtById[videoId]);
      if (!Number.isFinite(ts) || ts <= 0) continue;
      seen.add(videoId);
      out.ids.push(videoId);
      out.lastPlayedAtById[videoId] = ts;
      if (out.ids.length >= PLAY_HISTORY_MAX_ITEMS) break;
    }

    if (out.ids.length === 0) {
      for (const [key, value] of Object.entries(lastPlayedAtById)) {
        const videoId = String(key);
        if (!videoId || seen.has(videoId)) continue;
        const ts = Number(value);
        if (!Number.isFinite(ts) || ts <= 0) continue;
        seen.add(videoId);
        out.ids.push(videoId);
        out.lastPlayedAtById[videoId] = ts;
        if (out.ids.length >= PLAY_HISTORY_MAX_ITEMS) break;
      }
    }

    if (out.ids.length === 0) return empty;
    return out;
  }

  function safeLoadPlayHistory() {
    if (playHistoryCache) return playHistoryCache;

    let normalized = { version: PLAY_HISTORY_VERSION, ids: [], lastPlayedAtById: {} };
    try {
      const raw = localStorage.getItem(PLAY_HISTORY_STORAGE_KEY);
      if (raw) normalized = normalizePlayHistory(safeParseJson(raw));
    } catch (e) {
      console.warn('读取播放历史失败:', e);
    }

    playHistoryCache = normalized;
    return playHistoryCache;
  }

  function safePersistPlayHistory(next) {
    try {
      localStorage.setItem(PLAY_HISTORY_STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      console.warn('保存播放历史失败:', e);
    }
  }

  function emitPlayHistoryEvent(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (e) {
      // ignore
    }
  }

  function recordPlayHistoryWatched(videoId, playedAtMs) {
    const id = String(videoId);
    if (!id) return;

    const playedAt = Number(playedAtMs);
    if (!Number.isFinite(playedAt) || playedAt <= 0) return;

    const history = safeLoadPlayHistory();
    if (!history.lastPlayedAtById[id]) {
      history.ids.push(id);
      if (history.ids.length > PLAY_HISTORY_MAX_ITEMS) {
        const excess = history.ids.length - PLAY_HISTORY_MAX_ITEMS;
        const removed = history.ids.splice(0, excess);
        for (const removedId of removed) delete history.lastPlayedAtById[String(removedId)];
      }
    }

    history.lastPlayedAtById[id] = playedAt;
    history.version = PLAY_HISTORY_VERSION;

    playHistoryCache = history;
    safePersistPlayHistory(history);
    emitPlayHistoryEvent(PLAY_HISTORY_EVENT_UPDATED, { videoId: id, lastPlayedAt: playedAt });
  }

  function hasWatched(videoId) {
    const id = String(videoId);
    if (!id) return false;
    const history = safeLoadPlayHistory();
    return Boolean(history.lastPlayedAtById[id]);
  }

  function getPlayHistory() {
    const history = safeLoadPlayHistory();
    return history.ids.map((id) => ({ videoId: id, lastPlayedAt: history.lastPlayedAtById[id] || null }));
  }

  function clearPlayHistory() {
    playHistoryCache = { version: PLAY_HISTORY_VERSION, ids: [], lastPlayedAtById: {} };
    try {
      localStorage.removeItem(PLAY_HISTORY_STORAGE_KEY);
    } catch (e) {
      console.warn('清除播放历史失败:', e);
    }
    emitPlayHistoryEvent(PLAY_HISTORY_EVENT_CLEARED, {});
  }

  function safeGetSavedProgressSeconds(videoId) {
    try {
      const raw = localStorage.getItem(getProgressKey(videoId));
      if (raw === null) return null;
      const seconds = Number(raw);
      if (!Number.isFinite(seconds) || seconds <= 0) return null;
      return seconds;
    } catch (e) {
      console.warn('读取播放进度失败:', e);
      return null;
    }
  }

  function safeSaveProgressSeconds(videoId, seconds) {
    try {
      localStorage.setItem(getProgressKey(videoId), String(seconds));
    } catch (e) {
      console.warn('保存播放进度失败:', e);
    }
  }

  function safeClearProgress(videoId) {
    try {
      localStorage.removeItem(getProgressKey(videoId));
    } catch (e) {
      console.warn('清除播放进度失败:', e);
    }
  }

  function stopProgressTracking() {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }

    const player = getPlayer();
    if (player && progressEndedHandler) {
      try {
        player.off('ended', progressEndedHandler);
      } catch (e) {
        // ignore
      }
      progressEndedHandler = null;
    }

    progressVideoId = null;
    playHistoryMarked = false;
    playHistoryMarkedVideoId = null;
  }

  function cancelPendingResume() {
    const player = getPlayer();
    if (player && pendingResumeHandler) {
      try {
        player.off('loadedmetadata', pendingResumeHandler);
      } catch (e) {
        // ignore
      }
      pendingResumeHandler = null;
    }
  }

  function startProgressTracking(videoId) {
    const player = getPlayer();
    if (!player) return;

    stopProgressTracking();
    progressVideoId = videoId;
    playHistoryMarked = false;
    playHistoryMarkedVideoId = videoId;

    progressEndedHandler = () => {
      if (progressVideoId === videoId) safeClearProgress(videoId);
      stopProgressTracking();
    };
    player.on('ended', progressEndedHandler);

    progressTimer = setInterval(() => {
      const p = getPlayer();
      if (!p || progressVideoId !== state.currentVideoId) return;
      if (p.paused() || p.seeking()) return;

      const currentSeconds = Math.floor(p.currentTime() || 0);
      if (currentSeconds < PROGRESS_MIN_SECONDS) return;

      if (!playHistoryMarked && playHistoryMarkedVideoId === videoId) {
        playHistoryMarked = true;
        recordPlayHistoryWatched(videoId, Date.now());
      }

      const duration = p.duration();
      if (Number.isFinite(duration) && duration > 0) {
        if (currentSeconds / duration >= PROGRESS_DONE_RATIO) {
          safeClearProgress(videoId);
          return;
        }
      }

      safeSaveProgressSeconds(videoId, currentSeconds);
    }, PROGRESS_SAVE_INTERVAL_MS);
  }

  function seekToSavedProgressAndPlay(videoId) {
    cancelPendingResume();

    const player = getPlayer();
    if (!player) return;

    const resumeSeconds = safeGetSavedProgressSeconds(videoId);
    const playNow = () => player.play();

    if (!resumeSeconds) {
      playNow();
      return;
    }

    const seekAndPlay = () => {
      pendingResumeHandler = null;

      const duration = player.duration();
      let target = resumeSeconds;

      if (Number.isFinite(duration) && duration > 0) {
        if (target / duration >= PROGRESS_DONE_RATIO) {
          safeClearProgress(videoId);
          target = 0;
        } else {
          target = Math.min(target, Math.max(0, duration - 1));
        }
      }

      try {
        player.currentTime(target);
      } catch (e) {
        console.warn('恢复播放进度失败:', e);
      }

      playNow();
    };

    if (player.readyState() >= 1) {
      seekAndPlay();
    } else {
      pendingResumeHandler = seekAndPlay;
      player.one('loadedmetadata', pendingResumeHandler);
    }
  }

  VideoApp.Progress = {
    stopProgressTracking,
    cancelPendingResume,
    startProgressTracking,
    seekToSavedProgressAndPlay,
    safeGetSavedProgressSeconds,
    safeSaveProgressSeconds,
    safeClearProgress,
  };

  VideoApp.PlayHistory = {
    hasWatched,
    getPlayHistory,
    clearPlayHistory,
    recordPlayHistoryWatched,
    PLAY_HISTORY_STORAGE_KEY,
    PLAY_HISTORY_EVENT_UPDATED,
    PLAY_HISTORY_EVENT_CLEARED,
  };

  window.addEventListener('storage', (e) => {
    if (!e || e.key !== PLAY_HISTORY_STORAGE_KEY) return;
    playHistoryCache = null;
  });
})();
