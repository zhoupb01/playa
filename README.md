# 视频流服务器

基于 FastAPI 和 FFmpeg NVENC 的局域网视频流服务，支持 GPU 硬件加速转码，iPad 等设备在线播放。

## 功能特性

- 递归扫描子目录中的视频文件
- GPU 硬件加速转码（NVIDIA NVENC）
- HLS 流媒体协议，支持各种设备播放
- 简洁的网页播放器界面
- 自动转码缓存机制
- 视频搜索功能
- 仅局域网访问

## 系统要求

- Python 3.10+
- NVIDIA 显卡（支持 NVENC）
- FFmpeg（支持 CUDA 和 NVENC）
- 局域网环境

## 安装步骤

### 1. 激活虚拟环境

```bash
source .venv/bin/activate
```

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

### 3. 配置环境变量

编辑 `.env` 文件，根据需要修改配置：

```env
VIDEO_ROOT=/home/zhoupb/projects/video-server
CACHE_DIR=/home/zhoupb/projects/video-server/cache
SERVER_HOST=0.0.0.0
SERVER_PORT=8000
```

### 4. 确认 FFmpeg 支持 NVENC

```bash
ffmpeg -encoders | grep nvenc
```

应该看到 `h264_nvenc` 和 `hevc_nvenc` 等编码器。

## 启动服务

### 方式一：直接运行

```bash
python app.py
```

### 方式二：使用 uvicorn

```bash
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

启动后，服务将在 `http://0.0.0.0:8000` 上运行。

## 使用方法

### 1. 查找服务器局域网 IP

```bash
hostname -I | awk '{print $1}'
```

或者使用：

```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
```

### 2. 在 iPad 或其他设备上访问

假设服务器 IP 是 `192.168.1.100`，在浏览器中打开：

```
http://192.168.1.100:8000
```

### 3. 播放视频

- 从左侧列表选择视频
- 点击视频名称开始播放
- 首次播放会自动转码（可能需要等待几秒）
- 转码完成的视频会立即播放

## 目录结构

```
video-server/
├── app.py                # FastAPI 主应用
├── config.py             # 配置管理
├── video_scanner.py      # 视频扫描模块
├── transcoder.py         # GPU 转码模块
├── requirements.txt      # Python 依赖
├── .env                  # 环境配置
├── static/               # 静态资源
│   ├── index.html        # 播放器页面
│   └── style.css         # 样式文件
├── cache/                # HLS 切片缓存（自动生成）
└── README.md             # 使用说明
```

## API 端点

- `GET /` - 主页面
- `GET /api/videos` - 获取视频列表
- `GET /api/videos/{video_id}` - 获取单个视频信息
- `GET /stream/{video_id}/playlist.m3u8` - HLS 播放列表
- `GET /stream/{video_id}/segment_{n}.ts` - HLS 切片
- `GET /api/rescan` - 重新扫描视频目录

## 配置说明

### 修改转码参数

编辑 `config.py` 中的 `TRANSCODE_CONFIG`：

```python
TRANSCODE_CONFIG = {
    "preset": "p4",           # p1(快) 到 p7(慢但质量好)
    "tune": "hq",             # hq=高质量
    "rc": "vbr",              # 可变码率
    "video_bitrate": "5M",    # 视频码率
    "max_bitrate": "8M",      # 最大码率
    "bufsize": "10M",         # 缓冲大小
    "audio_bitrate": "192k",  # 音频码率
    "hls_time": "6",          # 每个切片时长（秒）
}
```

### 修改并发转码数

```python
MAX_CONCURRENT_TRANSCODES = 2  # 最多同时转码任务数
```

## 支持的视频格式

- .mkv
- .mp4
- .avi
- .mov
- .flv
- .wmv
- .m4v
- .webm

## 故障排查

### 1. GPU 转码不工作

检查 NVIDIA 驱动：

```bash
nvidia-smi
```

检查 FFmpeg CUDA 支持：

```bash
ffmpeg -hwaccels
```

### 2. 视频无法播放

- 检查浏览器控制台错误信息
- 确认视频正在转码（查看服务器日志）
- 等待几秒后刷新页面

### 3. 扫描不到视频

- 确认视频文件在 `VIDEO_ROOT` 目录下
- 检查文件扩展名是否在支持列表中
- 点击"重新扫描"按钮

### 4. 局域网无法访问

- 确认防火墙是否开放 8000 端口
- 确认服务器和设备在同一局域网
- 使用 `ifconfig` 或 `ip addr` 确认服务器 IP

## 性能优化建议

1. **RTX 5080 性能充足**：可以将 preset 改为 `p6` 或 `p7` 以获得更好的画质
2. **清理缓存**：定期删除 `cache/` 目录下的旧文件
3. **预转码**：提前转码常看的视频，避免首次播放等待

## 许可证

本项目仅供个人学习和局域网使用。
