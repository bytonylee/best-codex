import Foundation

struct SessionMetadata {
    let project: String
    let transcript: String
    let title: String
    let source: String
}

final class TranscriptResolver {
    private let sessionsRoot: String
    private let fm: FileManager

    init(homeDirectory: String = NSHomeDirectory(), fileManager: FileManager = .default) {
        let hiddenDir = "." + ["co", "dex"].joined()
        let root = ((homeDirectory as NSString).appendingPathComponent(hiddenDir) as NSString)
            .appendingPathComponent("sessions")
        sessionsRoot = root
        fm = fileManager
    }

    init(sessionsRoot: String, fileManager: FileManager = .default) {
        self.sessionsRoot = sessionsRoot
        self.fm = fileManager
    }

    func metadata(uuid: String, mtime: Date) -> SessionMetadata {
        let transcript = transcriptPath(uuid: uuid, mtime: mtime)
        guard !transcript.isEmpty else {
            return SessionMetadata(project: "", transcript: "", title: "", source: "CLI")
        }
        return SessionMetadata(
            project: project(from: transcript),
            transcript: transcript,
            title: title(from: transcript),
            source: source(from: transcript)
        )
    }

    private func transcriptPath(uuid: String, mtime: Date) -> String {
        let calendar = Calendar.current
        for offset in 0...1 {
            guard let date = calendar.date(byAdding: .day, value: -offset, to: mtime) else { continue }
            let components = calendar.dateComponents([.year, .month, .day], from: date)
            guard let year = components.year, let month = components.month, let day = components.day else { continue }
            let dir = (sessionsRoot as NSString).appendingPathComponent(String(format: "%04d/%02d/%02d", year, month, day))
            guard let files = try? fm.contentsOfDirectory(atPath: dir),
                  let name = files.first(where: { $0.contains(uuid) }) else { continue }
            return (dir as NSString).appendingPathComponent(name)
        }
        return ""
    }

    private func project(from transcript: String) -> String {
        guard let payload = firstPayload(in: transcript),
              let cwd = payload.cwd,
              !cwd.isEmpty else { return "" }
        return (cwd as NSString).lastPathComponent
    }

    private func source(from transcript: String) -> String {
        guard let payload = firstPayload(in: transcript) else { return "CLI" }
        let source = (payload.source ?? "").lowercased()
        let originator = (payload.originator ?? "").lowercased()
        if source == "cli" || originator.contains("tui") || originator.contains("cli") { return "CLI" }
        if !source.isEmpty { return "APP" }
        return "CLI"
    }

    private func title(from transcript: String) -> String {
        guard let fh = FileHandle(forReadingAtPath: transcript) else { return "" }
        defer { try? fh.close() }
        let data = fh.readData(ofLength: 65536)
        guard let text = String(data: data, encoding: .utf8) else { return "" }
        for line in text.split(separator: "\n") {
            guard let payload = decodePayload(String(line)),
                  payload.type == "thread_goal_updated",
                  let objective = payload.goal?.objective?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !objective.isEmpty else { continue }
            return objective.count > 60 ? String(objective.prefix(60)) + "…" : objective
        }
        return ""
    }

    private func firstPayload(in transcript: String) -> TranscriptPayload? {
        guard let fh = FileHandle(forReadingAtPath: transcript) else { return nil }
        defer { try? fh.close() }
        var bytes = Data()
        let chunk = 8192
        while true {
            let part = fh.readData(ofLength: chunk)
            if part.isEmpty { break }
            bytes.append(part)
            if part.contains(0x0A) { break }
        }
        guard let text = String(data: bytes, encoding: .utf8),
              let line = text.split(separator: "\n").first else { return nil }
        return decodePayload(String(line))
    }

    private func decodePayload(_ line: String) -> TranscriptPayload? {
        guard let data = line.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(TranscriptEnvelope.self, from: data).payload
    }
}

private struct TranscriptEnvelope: Decodable {
    let payload: TranscriptPayload
}

private struct TranscriptPayload: Decodable {
    let cwd: String?
    let source: String?
    let originator: String?
    let type: String?
    let goal: TranscriptGoal?
}

private struct TranscriptGoal: Decodable {
    let objective: String?
}
