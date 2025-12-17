(function () {
  'use strict';

  const VideoApp = (window.VideoApp = window.VideoApp || {});
  const state = (VideoApp.state = VideoApp.state || {});

  if (!('allVideos' in state)) state.allVideos = [];

  function hasWatchedVideo(videoId) {
    return Boolean(VideoApp.PlayHistory && typeof VideoApp.PlayHistory.hasWatched === 'function' && VideoApp.PlayHistory.hasWatched(videoId));
  }

  function cssEscape(value) {
    try {
      if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    } catch (e) {
      // ignore
    }
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function displayVideos(videos) {
    const list = document.getElementById('video-list');
    if (!list) return;
    list.innerHTML = '';

    const items = Array.isArray(videos) ? videos : [];
    if (items.length === 0) {
      list.innerHTML = '<li class="no-videos">暂无视频</li>';
      return;
    }

    items.forEach((video) => {
      const li = document.createElement('li');
      li.className = 'video-item';
      li.dataset.videoId = String(video && video.id !== undefined && video.id !== null ? video.id : '');
      if (video && video.id === state.currentVideoId) li.classList.add('active');
      if (video && hasWatchedVideo(video.id)) li.classList.add('video-item--watched');

      const nameDiv = document.createElement('div');
      nameDiv.className = 'video-name';
      nameDiv.textContent = String((video && video.name) || '');

      const sizeDiv = document.createElement('div');
      sizeDiv.className = 'video-size';
      const size = video && video.size_mb !== undefined && video.size_mb !== null ? String(video.size_mb) : '';
      sizeDiv.textContent = size ? `${size} MB` : '';

      li.appendChild(nameDiv);
      li.appendChild(sizeDiv);

      li.onclick = () => {
        if (VideoApp.Player && typeof VideoApp.Player.playVideo === 'function') {
          VideoApp.Player.playVideo(video);
        }
      };
      list.appendChild(li);
    });
  }

  function bindPlayHistoryEvents() {
    window.addEventListener('videoapp:playhistory:updated', (e) => {
      const videoId = e && e.detail && e.detail.videoId !== undefined && e.detail.videoId !== null ? String(e.detail.videoId) : '';
      if (!videoId) return;
      const li = document.querySelector(`.video-item[data-video-id="${cssEscape(videoId)}"]`);
      if (li) li.classList.add('video-item--watched');
    });

    window.addEventListener('videoapp:playhistory:cleared', () => {
      document.querySelectorAll('.video-item--watched').forEach((el) => el.classList.remove('video-item--watched'));
    });
  }

  async function loadVideos() {
    try {
      const response = await fetch('/api/videos');
      const data = await response.json();
      state.allVideos = Array.isArray(data && data.videos) ? data.videos : [];
      displayVideos(state.allVideos);

      const countEl = document.getElementById('video-count');
      if (countEl) countEl.textContent = `共 ${data && data.count ? data.count : state.allVideos.length} 个视频`;
    } catch (error) {
      console.error('加载视频列表失败:', error);
      alert('加载视频列表失败');
    }
  }

  function bindSearch() {
    const input = document.getElementById('search');
    if (!input) return;
    input.addEventListener('input', (e) => {
      const keyword = String((e && e.target && e.target.value) || '').toLowerCase();
      const filtered = state.allVideos.filter((v) => {
        const name = String((v && v.name) || '').toLowerCase();
        const path = String((v && v.relative_path) || '').toLowerCase();
        return name.includes(keyword) || path.includes(keyword);
      });
      displayVideos(filtered);
    });
  }

  async function rescanVideos() {
    try {
      const countEl = document.getElementById('video-count');
      if (countEl) countEl.textContent = '扫描中...';
      const response = await fetch('/api/rescan');
      const data = await response.json();
      alert((data && data.message) || '扫描完成');
      await loadVideos();
    } catch (error) {
      console.error('重新扫描失败:', error);
      alert('重新扫描失败');
    }
  }

  function init() {
    if (VideoApp.Sidebar && typeof VideoApp.Sidebar.initSidebarResize === 'function') {
      VideoApp.Sidebar.initSidebarResize();
    }
    if (VideoApp.Shortcuts && typeof VideoApp.Shortcuts.bindPlayerShortcuts === 'function') {
      VideoApp.Shortcuts.bindPlayerShortcuts();
    }
    bindPlayHistoryEvents();
    bindSearch();
    loadVideos();
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  VideoApp.VideoList = {
    loadVideos,
    displayVideos,
    rescanVideos,
  };

  window.loadVideos = loadVideos;
  window.displayVideos = displayVideos;
  window.rescanVideos = rescanVideos;
})();
