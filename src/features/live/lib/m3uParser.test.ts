import { describe, expect, it } from 'vitest'
import { parseM3uPlaylist } from './m3uParser'

describe('m3uParser', () => {
  it('正确解析标准 M3U 播放列表', () => {
    const content = `#EXTM3U
#EXTINF:-1 tvg-id="cctv1" tvg-name="CCTV-1" tvg-logo="https://logo.example/cctv1.png" group-title="央视频道",CCTV-1 综合
http://stream.example.com/cctv1.m3u8
#EXTINF:-1 tvg-id="hbtv" group-title="卫视频道",湖北卫视
https://stream.example.com/hbtv.m3u8`

    const channels = parseM3uPlaylist(content)
    expect(channels).toHaveLength(2)

    expect(channels[0]).toMatchObject({
      name: 'CCTV-1 综合',
      url: 'http://stream.example.com/cctv1.m3u8',
      group: '央视频道',
      logo: 'https://logo.example/cctv1.png',
      tvgId: 'cctv1',
      tvgName: 'CCTV-1',
    })

    expect(channels[1]).toMatchObject({
      name: '湖北卫视',
      url: 'https://stream.example.com/hbtv.m3u8',
      group: '卫视频道',
    })
  })

  it('正确解析 TVBox TXT 格式播放列表', () => {
    const content = `央视频道,#genre#
CCTV-1,http://stream.example.com/cctv1.m3u8
CCTV-2,http://stream.example.com/cctv2.m3u8
卫视频道,#genre#
湖南卫视,https://stream.example.com/hunantv.m3u8`

    const channels = parseM3uPlaylist(content)
    expect(channels).toHaveLength(3)

    expect(channels[0]).toMatchObject({
      name: 'CCTV-1',
      url: 'http://stream.example.com/cctv1.m3u8',
      group: '央视频道',
    })

    expect(channels[2]).toMatchObject({
      name: '湖南卫视',
      url: 'https://stream.example.com/hunantv.m3u8',
      group: '卫视频道',
    })
  })

  it('处理空内容与无效行', () => {
    expect(parseM3uPlaylist('')).toEqual([])
    expect(parseM3uPlaylist('invalid content without url')).toEqual([])
  })
})
