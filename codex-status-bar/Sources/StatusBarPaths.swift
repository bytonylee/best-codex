import Foundation

struct StatusBarPaths {
    let rootDirectory: String
    let statePath: String
    let activeSessionsDir: String
    let sessionStateDir: String
    let userQuitFlagPath: String

    init(homeDirectory: String = NSHomeDirectory()) {
        let hiddenDir = "." + ["co", "dex"].joined()
        let baseDir = (homeDirectory as NSString).appendingPathComponent(hiddenDir)
        let root = (baseDir as NSString).appendingPathComponent("statusbar")
        self.init(rootDirectory: root)
    }

    init(rootDirectory: String) {
        self.rootDirectory = rootDirectory
        statePath = (rootDirectory as NSString).appendingPathComponent("state" + ".json")
        activeSessionsDir = (rootDirectory as NSString).appendingPathComponent("sessions" + ".d")
        sessionStateDir = (rootDirectory as NSString).appendingPathComponent("session-state")
        userQuitFlagPath = (rootDirectory as NSString).appendingPathComponent("user_quit")
    }

    func sessionStatePath(for sessionId: String) -> String {
        (sessionStateDir as NSString).appendingPathComponent(sessionId + ".json")
    }
}
