import SwiftUI

@main
struct FitLogApp: App {
    var body: some Scene {
        WindowGroup {
            FitLogWebView()
                .ignoresSafeArea()
        }
    }
}
