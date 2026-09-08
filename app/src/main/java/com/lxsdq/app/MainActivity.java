package com.lxsdq.app;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
	
	private WebView webView;
	
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
		
		// 设置 WebViewClient，让所有链接在 App 内打开，不跳转浏览器
		webView.setWebViewClient(new WebViewClient());
		
		// 设置 WebChromeClient，支持 alert/confirm/prompt 等 JS 对话框
		webView.setWebChromeClient(new WebChromeClient());
		
		// 加载 assets 目录下的 index.html
		webView.loadUrl("file:///android_asset/index.html");
	}
	
	@Override
	public void onBackPressed() {
		// 如果 WebView 可以后退，则后退；否则退出 App
		if (webView != null && webView.canGoBack()) {
			webView.goBack();
			} else {
			super.onBackPressed();
		}
	}
}
