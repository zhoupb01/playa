import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# 基础配置
VIDEO_ROOT = Path(os.getenv("VIDEO_ROOT", os.getcwd()))

# 缓存目录默认跟随视频根目录
_default_cache = VIDEO_ROOT / ".cache"
CACHE_DIR = Path(os.getenv("CACHE_DIR", str(_default_cache)))

SERVER_HOST = os.getenv("SERVER_HOST", "0.0.0.0")
SERVER_PORT = int(os.getenv("SERVER_PORT", "8000"))

# 视频文件扩展名
VIDEO_EXTENSIONS = {'.mkv', '.mp4', '.avi', '.mov', '.flv', '.wmv', '.m4v', '.webm'}

# NVENC转码参数
TRANSCODE_CONFIG = {
    "preset": "p7",           # NVENC预设：p1(快)到p7(慢但质量好)
    "tune": "hq",             # 高质量调优
    "rc": "vbr",              # 可变码率
    "video_bitrate": "5M",    # 视频码率
    "max_bitrate": "8M",      # 最大码率
    "bufsize": "10M",         # 缓冲大小
    "audio_bitrate": "192k",  # 音频码率
    "hls_time": "6",          # 每个切片时长（秒）
}

# 并发控制
MAX_CONCURRENT_TRANSCODES = 2  # 最多同时转码任务数

# 确保目录存在
CACHE_DIR.mkdir(parents=True, exist_ok=True)
