package com.fatalmistake02.mira

import android.app.Application
import com.facebook.react.*
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactHostFactory

class MainApplication : Application(), DefaultReactHostFactory {
    private lateinit var mReactHost: ReactHost

    override fun onCreate() {
        super.onCreate()
        setupReactHost()
    }

    fun setupReactHost() {
        val context = this
        DefaultNewArchitectureEntryPoint.load()
        mReactHost = createReactHostImpl()
    }

    fun getReactHost(): ReactHost {
        return mReactHost
    }

    private fun createReactHostImpl(): ReactHost {
        val reactHost = ReactHost(this, DefaultReactHostFactory()) { context, hostDelegate ->
            ReactNativeHost(context, hostDelegate).apply {
                getUseDeveloperSupport
            }
        }
        return reactHost
    }
}
