import Foundation

enum StatusState: String, Decodable {
    case idle
    case thinking
    case tool
    case permission
    case waiting
    case done
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = StatusState(rawValue: raw) ?? .unknown
    }
}

struct StatusPayload: Decodable {
    let state: StatusState
    let label: String
    let tool: String
    let project: String
    let sessionId: String
    let transcript: String
    let startedAt: Double
    let ts: Double

    static let idle = StatusPayload(
        state: .idle,
        label: "",
        tool: "",
        project: "",
        sessionId: "",
        transcript: "",
        startedAt: 0,
        ts: 0
    )

    private enum CodingKeys: String, CodingKey {
        case state, label, tool, project, sessionId, transcript, startedAt, ts
    }

    init(
        state: StatusState,
        label: String,
        tool: String,
        project: String,
        sessionId: String,
        transcript: String,
        startedAt: Double,
        ts: Double
    ) {
        self.state = state
        self.label = label
        self.tool = tool
        self.project = project
        self.sessionId = sessionId
        self.transcript = transcript
        self.startedAt = startedAt
        self.ts = ts
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        state = try c.decodeIfPresent(StatusState.self, forKey: .state) ?? .idle
        label = try c.decodeIfPresent(String.self, forKey: .label) ?? ""
        tool = try c.decodeIfPresent(String.self, forKey: .tool) ?? ""
        project = try c.decodeIfPresent(String.self, forKey: .project) ?? ""
        sessionId = try c.decodeIfPresent(String.self, forKey: .sessionId) ?? ""
        transcript = try c.decodeIfPresent(String.self, forKey: .transcript) ?? ""
        startedAt = try c.decodeIfPresent(Double.self, forKey: .startedAt) ?? 0
        ts = try c.decodeIfPresent(Double.self, forKey: .ts) ?? 0
    }
}
