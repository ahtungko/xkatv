-- Migration: 202610270001_cleanup_danmaku_preferences.sql
-- 清理云端同步表 user_sync_records 中历史残留的弹幕偏好配置数据。
-- 弹幕功能已下线，相关配置不再参与跨设备同步。

delete from public.user_sync_records
where kind = 'preference'
  and (
    item_key in (
      'playback.isDanmakuEnabled',
      'playback.danmakuOpacity',
      'playback.danmakuFontSize',
      'playback.danmakuSpeed',
      'playback.isDanmakuAntiOverlap'
    )
    or item_key like 'playback.danmaku%'
    or item_key like 'playback.isDanmaku%'
  );
