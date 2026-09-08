package com.lxsdq.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;

public class MainActivity extends Activity {
	
	private WebView webView;
	private boolean backPressInFlight;
	
	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		setContentView(R.layout.activity_main);

		webView = (WebView) findViewById(R.id.webview);
		
		// 配置 WebView 设置
		WebSettings settings = webView.getSettings();
		settings.setJavaScriptEnabled(true);           // 启用 JavaScript（Chart.js 需要）
		settings.setDomStorageEnabled(true);           // 启用 localStorage（记账数据存储需要）
		settings.setDatabaseEnabled(true);             // 启用数据库
		settings.setAllowFileAccess(true);             // 允许访问本地文件
		settings.setAllowContentAccess(true);          // 允许访问内容
		settings.setCacheMode(WebSettings.LOAD_DEFAULT); // 默认缓存模式
		
		webView.setWebViewClient(new WebViewClient() {
			@Override
			public void onPageFinished(WebView view, String url) {
				super.onPageFinished(view, url);
				if (url != null && url.startsWith("file:///android_asset/")) {
					bootstrapSettingsUx(view);
				}
			}

			@Override
			public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
				return request != null && openExternalUrl(request.getUrl());
			}

			@Override
			@SuppressWarnings("deprecation")
			public boolean shouldOverrideUrlLoading(WebView view, String url) {
				return openExternalUrl(url == null ? null : Uri.parse(url));
			}
		});
		
		// 设置 WebChromeClient，支持 alert/confirm/prompt 等 JS 对话框
		webView.setWebChromeClient(new WebChromeClient());
		
		// 加载 assets 目录下的 index.html
		webView.loadUrl("file:///android_asset/index.html");
	}

	private void bootstrapSettingsUx(WebView view) {
		String versionName = JSONObject.quote(BuildConfig.VERSION_NAME);
		String runtimeInfo = "{versionName:" + versionName
				+ ",versionCode:" + BuildConfig.VERSION_CODE + "}";
		String script = "(function(){"
				+ "function applyRuntimeInfo(){window.AppRuntimeInfo=" + runtimeInfo + ";"
				+ "window.dispatchEvent(new CustomEvent('app-runtime-info-ready',"
				+ "{detail:window.AppRuntimeInfo}));}"
				+ "if(window.SettingsUX){applyRuntimeInfo();return;}"
				+ "var existing=document.querySelector('script[data-settings-ux-loader]');"
				+ "if(existing){existing.addEventListener('load',applyRuntimeInfo);return;}"
				+ "var loader=document.createElement('script');"
				+ "loader.src='settings-ux.js';"
				+ "loader.setAttribute('data-settings-ux-loader','true');"
				+ "loader.onload=applyRuntimeInfo;document.body.appendChild(loader);"
				+ "})();";
		view.evaluateJavascript(script, null);
	}

	private boolean openExternalUrl(Uri uri) {
		if (uri == null) return false;
		String scheme = uri.getScheme();
		if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) return false;
		try {
			startActivity(new Intent(Intent.ACTION_VIEW, uri));
			return true;
		} catch (Exception error) {
			return false;
		}
	}

	private void performDefaultBack() {
		if (webView != null && webView.canGoBack()) {
			webView.goBack();
		} else {
			super.onBackPressed();
		}
	}

	@Override
	public void onBackPressed() {
		if (webView == null) {
			performDefaultBack();
			return;
		}
		if (backPressInFlight) return;

		backPressInFlight = true;
		webView.evaluateJavascript(
				"(function(){try{return !!(window.SettingsUX"
						+ "&&window.SettingsUX.handleBack"
						+ "&&window.SettingsUX.handleBack());}catch(error){return false;}})();",
				result -> {
					backPressInFlight = false;
					if (!"true".equals(result)) performDefaultBack();
				});
	}
}
