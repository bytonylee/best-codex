import Foundation

final class SessionStore {
    let paths: StatusBarPaths
    private let fm: FileManager

    init(paths: StatusBarPaths = StatusBarPaths(), fileManager: FileManager = .default) {
        self.paths = paths
        self.fm = fileManager
    }

    func recentSessionFiles(limit: Int) -> [(uuid: String, mtime: Date)] {
        let jsonSuffix = "." + "json"
        var entries: [String: Date] = [:]
        mergeFiles(in: paths.activeSessionsDir, into: &entries) { $0 }
        mergeFiles(in: paths.sessionStateDir, into: &entries) { name in
            name.hasSuffix(jsonSuffix) ? String(name.dropLast(jsonSuffix.count)) : ""
        }
        return entries
            .map { (uuid: $0.key, mtime: $0.value) }
            .sorted { $0.mtime > $1.mtime }
            .prefix(limit)
            .map { $0 }
    }

    func recentSessionPayloads(limit: Int) -> [StatusPayload] {
        recentSessionFiles(limit: limit).compactMap { entry in
            let path = paths.sessionStatePath(for: entry.uuid)
            guard let data = fm.contents(atPath: path), !data.isEmpty else { return nil }
            return try? JSONDecoder().decode(StatusPayload.self, from: data)
        }
    }

    func sessionCount() -> Int {
        (try? fm.contentsOfDirectory(atPath: paths.activeSessionsDir).count) ?? 0
    }

    func sessionIsActive(_ sessionId: String) -> Bool {
        guard !sessionId.isEmpty else { return false }
        return fm.fileExists(atPath: (paths.activeSessionsDir as NSString).appendingPathComponent(sessionId))
    }

    private func mergeFiles(
        in directory: String,
        into entries: inout [String: Date],
        normalizeName: (String) -> String
    ) {
        guard let names = try? fm.contentsOfDirectory(atPath: directory) else { return }
        for name in names {
            let path = (directory as NSString).appendingPathComponent(name)
            guard let mtime = (try? fm.attributesOfItem(atPath: path))?[.modificationDate] as? Date else { continue }
            let uuid = normalizeName(name)
            guard !uuid.isEmpty else { continue }
            entries[uuid] = max(entries[uuid] ?? .distantPast, mtime)
        }
    }
}
