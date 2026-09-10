const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withNotificationIcon(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const srcBase = path.join(projectRoot, 'assets', 'notification-icon', 'android');
      const destBase = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');

      if (!fs.existsSync(srcBase)) {
        console.warn('[with-notification-icon] src not found:', srcBase);
        return cfg;
      }

      const densities = ['hdpi', 'mdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
      for (const d of densities) {
        const src = path.join(srcBase, `mipmap-${d}`, 'ic_notification.png');
        const destDir = path.join(destBase, `mipmap-${d}`);
        const dest = path.join(destDir, 'ic_notification.png');
        if (fs.existsSync(src)) {
          await fs.promises.mkdir(destDir, { recursive: true });
          await fs.promises.copyFile(src, dest);
          const drawableDir = path.join(destBase, `drawable-${d}`);
          await fs.promises.mkdir(drawableDir, { recursive: true });
          await fs.promises.copyFile(src, path.join(drawableDir, 'ic_notification.png'));
          console.log(`[with-notification-icon] copied ${d} ic_notification.png`);
        }
      }
      return cfg;
    },
  ]);
}

module.exports = withNotificationIcon;
