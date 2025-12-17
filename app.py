import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from config import VIDEO_ROOT, SERVER_HOST, SERVER_PORT
from video_scanner import video_index
from transcoder import transcode_manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时执行
    logger.info("正在扫描视频目录...")
    count = video_index.scan(VIDEO_ROOT)
    logger.info(f"扫描完成，发现 {count} 个视频文件")
    yield
    # 关闭时执行（如有需要）
    logger.info("服务正在关闭...")


# 创建FastAPI应用
app = FastAPI(title="视频流服务", version="1.0.0", lifespan=lifespan)

# 挂载静态文件目录
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def home():
    """主页"""
    return FileResponse("static/index.html")


@app.get("/api/videos")
async def list_videos():
    """获取视频列表API"""
    videos = video_index.get_all()
    return {
        "count": len(videos),
        "videos": list(videos.values())
    }


@app.get("/api/videos/{video_id}")
async def get_video(video_id: str):
    """获取单个视频信息"""
    video = video_index.get_by_id(video_id)
    if not video:
        raise HTTPException(status_code=404, detail="视频不存在")
    return video


@app.get("/stream/{video_id}/playlist.m3u8")
async def get_playlist(video_id: str):
    """获取HLS播放列表"""
    # 获取视频信息
    video = video_index.get_by_id(video_id)
    if not video:
        raise HTTPException(status_code=404, detail="视频不存在")

    # 检查是否已转码
    playlist_path = transcode_manager.get_playlist_path(video_id)

    # 如果未转码，启动转码
    if not playlist_path:
        logger.info(f"视频 {video_id} 未转码，开始转码...")

        # 异步启动转码（不阻塞）
        asyncio.create_task(
            transcode_manager.transcode_to_hls(video_id, video['path'])
        )

        # 等待一小段时间，让转码开始生成第一个切片
        await asyncio.sleep(2)

        # 再次检查
        playlist_path = transcode_manager.get_playlist_path(video_id)
        if not playlist_path:
            raise HTTPException(
                status_code=503,
                detail="视频正在转码中，请稍后刷新"
            )

    # 返回m3u8文件
    return FileResponse(
        playlist_path,
        media_type="application/vnd.apple.mpegurl",
        headers={
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*"
        }
    )


@app.get("/stream/{video_id}/segment_{segment_num:int}.ts")
async def get_segment(video_id: str, segment_num: int):
    """获取HLS切片"""
    segment_path = transcode_manager.get_segment_path(video_id, segment_num)

    if not segment_path:
        # 等待一下，切片可能正在生成
        await asyncio.sleep(1)
        segment_path = transcode_manager.get_segment_path(video_id, segment_num)

    if not segment_path:
        raise HTTPException(status_code=404, detail="切片不存在")

    return FileResponse(
        segment_path,
        media_type="video/mp2t",
        headers={
            "Cache-Control": "public, max-age=3600",
            "Access-Control-Allow-Origin": "*"
        }
    )


@app.get("/api/rescan")
async def rescan_videos():
    """重新扫描视频目录"""
    logger.info("手动触发视频扫描...")
    count = video_index.scan(VIDEO_ROOT)
    return {"message": f"扫描完成，发现 {count} 个视频文件"}


if __name__ == "__main__":
    import uvicorn
    logger.info(f"启动服务: http://{SERVER_HOST}:{SERVER_PORT}")
    uvicorn.run(
        "app:app",
        host=SERVER_HOST,
        port=SERVER_PORT,
        reload=False
    )
