import Foundation

struct HeaderSessionChoice {
    let uuid: String
}

struct HeaderStatusResolution {
    let selectedSessionId: String?
    let payload: StatusPayload
    let shouldSleep: Bool
}

enum HeaderStatusPolicy {
    static let maxWorkingAge: TimeInterval = 900

    static func resolve(
        storedId: String?,
        recents: [HeaderSessionChoice],
        current: StatusPayload,
        sessionPayloads: [StatusPayload],
        now: TimeInterval
    ) -> HeaderStatusResolution {
        let selectedId = selectedSessionId(storedId: storedId, recents: recents)
        let selectedPayload = selectedId.flatMap { id in
            ([current] + sessionPayloads).first { $0.sessionId == id && isUsable($0, now: now) }
        }
        let display = selectedPayload
            ?? sessionPayloads.first { isUsable($0, now: now) }
            ?? current
        let selectedIsWorking = selectedId == display.sessionId && display.state.isWorking
        let selectedIsDone = selectedPayload?.state == .done
        let shouldSleep = selectedId != nil && !selectedIsWorking && selectedIsDone
        return HeaderStatusResolution(selectedSessionId: selectedId, payload: display, shouldSleep: shouldSleep)
    }

    private static func selectedSessionId(storedId: String?, recents: [HeaderSessionChoice]) -> String? {
        guard !recents.isEmpty else { return nil }
        if let storedId, recents.contains(where: { $0.uuid == storedId }) {
            return storedId
        }
        return recents[0].uuid
    }

    private static func isUsable(_ payload: StatusPayload, now: TimeInterval) -> Bool {
        !(payload.state.isWorking && now - payload.ts > maxWorkingAge)
    }
}

extension StatusState {
    var isWorking: Bool {
        self == .thinking || self == .tool
    }
}
