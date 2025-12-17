import os
import hashlib
from pathlib import Path
from typing import Dict, List
from config import VIDEO_ROOT, VIDEO_EXTENSIONS


class VideoIndex:
    """视频索引管理类"""

    def __init__(self):
        self.videos: Dict[str, dict] = {}

    def scan(self, root_dir: Path = VIDEO_ROOT) -> int:
        """
        递归扫描目录，建立视频索引

        Args:
            root_dir: 扫描的根目录

        Returns:
            发现的视频文件数量
        """
        self.videos.clear()
        count = 0

        for root, dirs, files in os.walk(root_dir):
            # 跳过缓存目录和隐藏目录
            dirs[:] = [d for d in dirs if not d.startswith('.') and d != 'cache' and d != 'static']

            for file in files:
                file_path = Path(root) / file

                # 检查是否为视频文件
                if file_path.suffix.lower() in VIDEO_EXTENSIONS:
                    video_id = self._generate_id(str(file_path))
                    relative_path = file_path.relative_to(root_dir)

                    self.videos[video_id] = {
                        'id': video_id,
                        'name': file,
                        'path': str(file_path),
                        'relative_path': str(relative_path),
                        'size': file_path.stat().st_size,
                        'size_mb': round(file_path.stat().st_size / (1024 * 1024), 2),
                    }
                    count += 1

        return count

    def _generate_id(self, path: str) -> str:
        """根据文件路径生成唯一ID"""
        return hashlib.md5(path.encode()).hexdigest()[:12]

    def get_all(self) -> Dict[str, dict]:
        """获取所有视频"""
        return self.videos

    def get_by_id(self, video_id: str) -> dict:
        """根据ID获取视频信息"""
        return self.videos.get(video_id)

    def search(self, keyword: str) -> List[dict]:
        """搜索视频"""
        keyword = keyword.lower()
        results = []

        for video in self.videos.values():
            if keyword in video['name'].lower():
                results.append(video)

        return results


# 全局视频索引实例
video_index = VideoIndex()
