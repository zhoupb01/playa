(function () {
  'use strict';

  const VideoApp = (window.VideoApp = window.VideoApp || {});
  const state = (VideoApp.state = VideoApp.state || {});

  if (!('allVideos' in state)) state.allVideos = [];
  if (!('player' in state)) state.player = null;
  if (!('currentVideoId' in state)) state.currentVideoId = null;
  if (!('currentHls' in state)) state.currentHls = null;

  function setStatusText(text) {
    const el = document.getElementById('status');
    if (el) el.textContent = text;
  }

  function initPlayer() {
    if (state.player) return state.player;
    if (typeof window.videojs !== 'function') throw new Error('Video.js 未加载');

    state.player = window.videojs('player', {
      controls: true,
      autoplay: false,
      preload: 'auto',
      fill: true,
      html5: {
        vhs: {
          enableLowInitialPlaylist: true,
          smoothQualityChange: true,
          overrideNative: true,
        },
        nativeAudioTracks: false,
        nativeVideoTracks: false,
      },
    });
    return state.player;
  }

  async function playVideo(video) {
    if (!video || video.id === undefined || video.id === null) return;

    let player;
    try {
      player = initPlayer();
    } catch (e) {
      console.error('初始化播放器失败:', e);
      alert('初始化播放器失败');
      return;
    }

    if (VideoApp.Progress) {
      VideoApp.Progress.stopProgressTracking();
      VideoApp.Progress.cancelPendingResume();
    }

    if (state.currentHls) {
      try {
        state.currentHls.destroy();
      } catch (e) {
        // ignore
      }
      state.currentHls = null;
    }

    document.getElementById('welcome').style.display = 'none';
    document.getElementById('player-container').style.display = 'flex';

    const videoId = video.id;
    state.currentVideoId = videoId;

    if (VideoApp.VideoList && typeof VideoApp.VideoList.displayVideos === 'function') {
      VideoApp.VideoList.displayVideos(state.allVideos);
    }

    const infoEl = document.getElementById('info');
    if (infoEl) {
      infoEl.innerHTML = '';

      const titleEl = document.createElement('h3');
      titleEl.textContent = String(video.name || '');

      const metaEl = document.createElement('p');
      const size = video.size_mb !== undefined && video.size_mb !== null ? String(video.size_mb) : '';
      const path = video.relative_path !== undefined && video.relative_path !== null ? String(video.relative_path) : '';
      metaEl.textContent = `大小: ${size} MB | 路径: ${path}`;

      const statusEl = document.createElement('p');
      statusEl.id = 'status';
      statusEl.textContent = '正在加载...';

      infoEl.appendChild(titleEl);
      infoEl.appendChild(metaEl);
      infoEl.appendChild(statusEl);
    }

    const streamUrl = `/stream/${video.id}/playlist.m3u8`;

    try {
      if (window.Hls && typeof window.Hls.isSupported === 'function' && window.Hls.isSupported()) {
        state.currentHls = new window.Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
        });

        state.currentHls.loadSource(streamUrl);
        state.currentHls.attachMedia(player.tech().el());

        state.currentHls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          if (videoId !== state.currentVideoId) return;
          setStatusText('准备就绪');
          if (VideoApp.Progress) {
            VideoApp.Progress.startProgressTracking(videoId);
            VideoApp.Progress.seekToSavedProgressAndPlay(videoId);
          } else {
            player.play();
          }
        });

        state.currentHls.on(window.Hls.Events.ERROR, (event, data) => {
          if (videoId !== state.currentVideoId) return;
          if (!data || !data.fatal) return;

          console.error('HLS错误:', data);
          if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
            setStatusText('视频正在转码中，请稍后刷新...');
            setTimeout(() => {
              if (state.currentVideoId !== videoId) return;
              playVideo(video);
            }, 3000);
          } else {
            setStatusText('播放出错: ' + data.type);
          }
        });
        return;
      }

      const videoEl = player.tech().el();
      if (videoEl && typeof videoEl.canPlayType === 'function' && videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        player.src({ src: streamUrl, type: 'application/x-mpegURL' });
        setStatusText('准备就绪');
        if (VideoApp.Progress) {
          VideoApp.Progress.startProgressTracking(videoId);
          VideoApp.Progress.seekToSavedProgressAndPlay(videoId);
        } else {
          player.play();
        }
        return;
      }

      setStatusText('浏览器不支持HLS播放');
    } catch (error) {
      console.error('播放失败:', error);
      setStatusText('播放失败: ' + (error && error.message ? error.message : String(error)));
    }
  }

  VideoApp.Player = {
    initPlayer,
    playVideo,
  };
})();
