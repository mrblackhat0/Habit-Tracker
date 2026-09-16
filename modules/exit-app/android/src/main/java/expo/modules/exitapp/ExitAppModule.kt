package expo.modules.exitapp

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExitAppModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExitApp")

    Function("exitAndRemoveTask") {
      appContext.currentActivity?.finishAndRemoveTask()
    }
  }
}
