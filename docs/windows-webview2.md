# Windows WebView2 runtime

Doe uses pywebview with the EdgeChromium renderer on Windows. The renderer requires the Microsoft Edge WebView2 Runtime.

The application performs a preflight check before entering `webview.start()`. If the Runtime is missing, Doe reports the problem instead of appearing to hang.

For production distribution, ship/install the WebView2 Runtime as part of the Windows installer/bootstrap process. A Fixed Version runtime can be bundled with the application, while Evergreen can be installed separately and updated automatically.
