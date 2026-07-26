import SwiftUI
import UIKit
import WebKit

struct FitLogWebView: UIViewRepresentable {
    private let appURL = URL(string: "https://fitlog-fawn.vercel.app")!

    func makeCoordinator() -> Coordinator {
        Coordinator(allowedHost: appURL.host!)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        let controller = configuration.userContentController
        controller.add(context.coordinator.healthBridge, name: "fitlogHealth")
        controller.addUserScript(WKUserScript(
            source: """
            Object.defineProperty(window, 'fitlogNative', {
              value: Object.freeze({ platform: 'ios', healthKit: true, bridgeVersion: 1 }),
              configurable: false
            });
            window.dispatchEvent(new CustomEvent('fitlog:native-ready'));
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = true
        context.coordinator.healthBridge.webView = webView
        webView.load(URLRequest(url: appURL, cachePolicy: .useProtocolCachePolicy))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "fitlogHealth")
        coordinator.healthBridge.webView = nil
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        let healthBridge = HealthBridgeController()
        private let allowedHost: String

        init(allowedHost: String) {
            self.allowedHost = allowedHost
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }
            if url.host == allowedHost || url.scheme == "about" {
                decisionHandler(.allow)
                return
            }
            if navigationAction.navigationType == .linkActivated {
                UIApplication.shared.open(url)
            }
            decisionHandler(.cancel)
        }
    }
}
