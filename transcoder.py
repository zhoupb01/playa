import asyncio
import logging
from pathlib import Path
from typing import Optional
from config import CACHE_DIR, TRANSCODE_CONFIG, MAX_CONCURRENT_TRANSCODES

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TranscodeManager:
    """转码管理器"""

    def __init__(self):
        self.active_tasks = {}
        self.semaphore = asyncio.Semaphore(MAX_CONCURRENT_TRANSCODES)

    async def transcode_to_hls(self, video_id: str, video_path: str) -> bool:
        """
        将视频转码为HLS格式

        Args:
            video_id: 视频ID
            video_path: 视频文件路径

        Returns:
            转码是否成功
        """
        output_dir = CACHE_DIR / video_id
        output_dir.mkdir(parents=True, exist_ok=True)

        playlist_path = output_dir / "playlist.m3u8"

        # 如果已经转码完成，直接返回
        if playlist_path.exists():
            logger.info(f"视频 {video_id} 已经转码完成，使用缓存")
            return True

        # 如果正在转码，等待完成
        if video_id in self.active_tasks:
            logger.info(f"视频 {video_id} 正在转码中，等待完成")
            return await self.active_tasks[video_id]

        # 创建新的转码任务
        task = asyncio.create_task(self._do_transcode(video_id, video_path, output_dir))
        self.active_tasks[video_id] = task

        try:
            result = await task
            return result
        finally:
            del self.active_tasks[video_id]

    async def _do_transcode(self, video_id: str, video_path: str, output_dir: Path) -> bool:
        """执行转码"""
        async with self.semaphore:
            logger.info(f"开始转码视频 {video_id}: {video_path}")

            segment_pattern = str(output_dir / "segment_%03d.ts")
            playlist_path = str(output_dir / "playlist.m3u8")

            # 构建FFmpeg命令
            cmd = [
                'ffmpeg',
                '-hwaccel', 'cuda',
                '-hwaccel_output_format', 'cuda',
                '-i', video_path,
                '-c:v', 'h264_nvenc',
                '-preset', TRANSCODE_CONFIG['preset'],
                '-tune', TRANSCODE_CONFIG['tune'],
                '-rc', TRANSCODE_CONFIG['rc'],
                '-b:v', TRANSCODE_CONFIG['video_bitrate'],
                '-maxrate', TRANSCODE_CONFIG['max_bitrate'],
                '-bufsize', TRANSCODE_CONFIG['bufsize'],
                '-c:a', 'aac',
                '-b:a', TRANSCODE_CONFIG['audio_bitrate'],
                '-f', 'hls',
                '-hls_time', TRANSCODE_CONFIG['hls_time'],
                '-hls_list_size', '0',
                '-hls_segment_filename', segment_pattern,
                playlist_path
            ]

            try:
                # 执行转码
                process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )

                stdout, stderr = await process.communicate()

                if process.returncode == 0:
                    logger.info(f"视频 {video_id} 转码成功")
                    return True
                else:
                    logger.error(f"视频 {video_id} 转码失败: {stderr.decode()}")
                    return False

            except Exception as e:
                logger.error(f"转码过程出错: {e}")
                return False

    def get_playlist_path(self, video_id: str) -> Optional[Path]:
        """获取HLS播放列表路径"""
        playlist_path = CACHE_DIR / video_id / "playlist.m3u8"
        if playlist_path.exists():
            return playlist_path
        return None

    def get_segment_path(self, video_id: str, segment_num: int) -> Optional[Path]:
        """获取HLS切片路径"""
        segment_path = CACHE_DIR / video_id / f"segment_{segment_num:03d}.ts"
        if segment_path.exists():
            return segment_path
        return None


# 全局转码管理器实例
transcode_manager = TranscodeManager()
