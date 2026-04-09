package com.fatalmistake02.mira

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.modules.core.PermissionListener

class MainActivity : ReactActivity() {
    private var mPermissionListener: PermissionListener? = null

    override fun getMainComponentName(): String {
        return "Mira"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Handle deep links
        handleIntentData(intent)
    }

    override fun createReactActivityDelegate(): ReactActivityDelegate {
        return DefaultReactActivityDelegate(
            this,
            mainComponentName,
            DefaultNewArchitectureEntryPoint.fabricEnabled
        )
    }

    private fun handleIntentData(intent: android.content.Intent) {
        if (intent != null) {
            val data = intent.data
            if (data != null) {
                // Handle deep links (http, https, mailto, mira schemes)
                val url = data.toString()
                // Pass to React Native bridge
            }
        }
    }
}
