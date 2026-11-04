import VideoSource from '../components/VideoSource'
import SubscriptionManager from '../components/VideoSource/SubscriptionManager'
import LiveSourceManager from '../components/LiveSource/LiveSourceManager'
import { SettingsPageShell } from '../components/common'

/**
 * SourceSettings - 视频源管理设置页
 */
export default function SourceSettings() {
  return (
    <SettingsPageShell
      title="视频源管理"
      description="管理站点可用视频源，支持导入、导出、启停与参数编辑。"
      showHeader={false}
    >
      <SubscriptionManager />
      <LiveSourceManager />
      <VideoSource />
    </SettingsPageShell>
  )
}
