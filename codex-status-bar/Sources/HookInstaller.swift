import CryptoKit
import Foundation

enum HookInstaller {
    static func ensureHooksInstalled(currentVersion: String) {
        let defaults = UserDefaults.standard
        let currentHash = hookContentHash()
        let versionMatches = defaults.string(forKey: "installedVersion") == currentVersion
        let hashMatches = defaults.string(forKey: "installedHookHash") == currentHash
        guard !versionMatches || !hashMatches,
              let installer = Bundle.main.path(forResource: "install", ofType: "js") else { return }

        DispatchQueue.global().async {
            guard let node = locateNode() else {
                NSLog("CodexStatusBar: could not find node; hooks not installed (will retry next launch)")
                return
            }
            let task = Process()
            task.executableURL = URL(fileURLWithPath: node)
            task.arguments = [installer]
            try? task.run()
            task.waitUntilExit()
            if task.terminationStatus == 0 {
                defaults.set(currentVersion, forKey: "installedVersion")
                defaults.set(currentHash, forKey: "installedHookHash")
            }
        }
    }

    static func hookContentHash() -> String {
        var data = Data()
        for name in ["install", "update", "lifecycle"] {
            guard let url = Bundle.main.url(forResource: name, withExtension: "js"),
                  let script = try? Data(contentsOf: url) else { continue }
            data.append(Data(name.utf8))
            data.append(0)
            data.append(script)
            data.append(0)
        }
        return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    static func locateNode() -> String? {
        let fm = FileManager.default
        let home = NSHomeDirectory()
        var candidates = [
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/usr/bin/node",
            "\(home)/.volta/bin/node",
            "\(home)/.asdf/shims/node",
            "\(home)/.bun/bin/node",
        ]
        let nvmDir = "\(home)/.nvm/versions/node"
        if let versions = try? fm.contentsOfDirectory(atPath: nvmDir) {
            for v in versions.sorted(by: >) { candidates.append("\(nvmDir)/\(v)/bin/node") }
        }
        for path in candidates where fm.isExecutableFile(atPath: path) { return path }

        for args in [["-ilc", "command -v node"], ["-lc", "command -v node"]] {
            let p = Process()
            p.executableURL = URL(fileURLWithPath: "/bin/zsh")
            p.arguments = args
            let pipe = Pipe()
            p.standardOutput = pipe
            p.standardError = FileHandle.nullDevice
            guard (try? p.run()) != nil else { continue }
            p.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let path = (String(data: data, encoding: .utf8) ?? "")
                .split(separator: "\n").last.map(String.init)?
                .trimmingCharacters(in: .whitespaces) ?? ""
            if !path.isEmpty, fm.isExecutableFile(atPath: path) { return path }
        }
        return nil
    }
}
