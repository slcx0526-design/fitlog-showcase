import Foundation
import WebKit

final class HealthBridgeController: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?
    private let service = HealthKitService()

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "fitlogHealth",
              let body = message.body as? [String: Any],
              body["action"] as? String == "sync" else {
            sendError("Unsupported native health request.")
            return
        }
        let requestedDays = body["days"] as? Int ?? 90
        service.sync(days: requestedDays) { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case .success(let payload):
                    self?.send(payload: payload)
                case .failure(let error):
                    self?.sendError(error.localizedDescription)
                }
            }
        }
    }

    private func send(payload: AppleHealthSnapshotPayload) {
        guard let data = try? JSONEncoder().encode(payload),
              let json = String(data: data, encoding: .utf8) else {
            sendError("Apple Health data could not be encoded.")
            return
        }
        webView?.evaluateJavaScript(
            "window.dispatchEvent(new CustomEvent('fitlog:health-snapshot',{detail:\(json)}));"
        )
    }

    private func sendError(_ message: String) {
        guard let data = try? JSONEncoder().encode(message),
              let json = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(
                "window.dispatchEvent(new CustomEvent('fitlog:health-error',{detail:\(json)}));"
            )
        }
    }
}
