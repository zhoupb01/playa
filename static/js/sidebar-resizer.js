(function () {
  'use strict';

  const VideoApp = (window.VideoApp = window.VideoApp || {});

  const SIDEBAR_WIDTH_STORAGE_KEY = 'ui.sidebarWidth';
  const SIDEBAR_MIN_WIDTH = 200;
  const SIDEBAR_MAX_WIDTH = 800;

  let initialized = false;

  function clampNumber(v, min, max) {
    if (!Number.isFinite(v)) return min;
    return Math.min(max, Math.max(min, v));
  }

  function safeLoadSidebarWidth() {
    try {
      const raw = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
      if (raw === null) return null;
      const n = Number(raw);
      if (!Number.isFinite(n)) return null;
      return Math.round(clampNumber(n, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH));
    } catch (e) {
      console.warn('读取侧边栏宽度失败:', e);
      return null;
    }
  }

  function safeSaveSidebarWidth(widthPx) {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(widthPx));
    } catch (e) {
      console.warn('保存侧边栏宽度失败:', e);
    }
  }

  function applySidebarWidth(widthPx) {
    document.documentElement.style.setProperty('--sidebar-width', `${widthPx}px`);
  }

  function initSidebarResize() {
    if (initialized) return;
    initialized = true;

    const sidebar = document.querySelector('.sidebar');
    const resizer = document.getElementById('sidebar-resizer');
    if (!sidebar || !resizer) return;

    const mobileQuery = window.matchMedia('(max-width: 900px)');
    const isResizableLayout = () => !mobileQuery.matches;

    const restore = () => {
      const saved = safeLoadSidebarWidth();
      if (saved && isResizableLayout()) applySidebarWidth(saved);
    };
    restore();

    const onLayoutChange = () => restore();
    if (typeof mobileQuery.addEventListener === 'function') {
      mobileQuery.addEventListener('change', onLayoutChange);
    } else if (typeof mobileQuery.addListener === 'function') {
      mobileQuery.addListener(onLayoutChange);
    }

    // 拖动状态
    let state = {
      isDragging: false,
      startX: 0,
      startWidth: 0
    };

    // 鼠标移动处理
    function handleMouseMove(e) {
      if (!state.isDragging) return;

      const diff = e.clientX - state.startX;
      const newWidth = clampNumber(state.startWidth + diff, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH);
      applySidebarWidth(newWidth);
    }

    // 结束拖动
    function handleMouseUp() {
      if (!state.isDragging) return;

      state.isDragging = false;

      // 清理样式
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      sidebar.classList.remove('sidebar--resizing');

      // 移除事件监听
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      // 保存宽度
      const currentWidth = parseInt(getComputedStyle(sidebar).width);
      if (Number.isFinite(currentWidth)) {
        safeSaveSidebarWidth(currentWidth);
      }
    }

    // 开始拖动
    resizer.addEventListener('mousedown', (e) => {
      if (!isResizableLayout()) return;
      if (e.button !== 0) return;

      e.preventDefault();

      // 如果已经在拖动，先结束
      if (state.isDragging) {
        handleMouseUp();
      }

      state.isDragging = true;
      state.startX = e.clientX;
      state.startWidth = parseInt(getComputedStyle(sidebar).width) || 400;

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      sidebar.classList.add('sidebar--resizing');

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    });

    // ESC 键取消
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.isDragging) {
        applySidebarWidth(state.startWidth);
        handleMouseUp();
      }
    });

    // 窗口失焦时停止
    window.addEventListener('blur', () => {
      if (state.isDragging) {
        handleMouseUp();
      }
    });
  }

  VideoApp.Sidebar = {
    initSidebarResize,
  };
})();
