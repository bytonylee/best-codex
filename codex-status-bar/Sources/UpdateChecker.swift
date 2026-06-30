import Cocoa

final class UpdateChecker {
    var currentVersion: String { (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "0" }

    private let releaseAPIURL = "https://api.github.com/repos/tonylee/codex-status-bar/releases/latest"
    private let releasePageURL = "https://github.com/tonylee/codex-status-bar/releases/latest"

    func checkForUpdate() {
        let d = UserDefaults.standard
        let now = Date().timeIntervalSince1970
        if now - d.double(forKey: "lastUpdateCheck") < 86400 { return }
        guard let url = URL(string: releaseAPIURL) else { return }
        var req = URLRequest(url: url)
        req.setValue("CodexStatusBar", forHTTPHeaderField: "User-Agent")
        URLSession.shared.dataTask(with: req) { data, _, _ in
            guard let data = data,
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let tag = obj["tag_name"] as? String else { return }
            let ver = tag.hasPrefix("v") ? String(tag.dropFirst()) : tag
            UserDefaults.standard.set(ver, forKey: "latestVersion")
            UserDefaults.standard.set(now, forKey: "lastUpdateCheck")
        }.resume()
    }

    func versionIsNewer(_ a: String, than b: String) -> Bool {
        let pa = a.split(separator: ".").map { Int($0) ?? 0 }
        let pb = b.split(separator: ".").map { Int($0) ?? 0 }
        for i in 0..<max(pa.count, pb.count) {
            let x = i < pa.count ? pa[i] : 0, y = i < pb.count ? pb[i] : 0
            if x != y { return x > y }
        }
        return false
    }

    func openLatestRelease() {
        if let url = URL(string: releasePageURL) { NSWorkspace.shared.open(url) }
    }
}
