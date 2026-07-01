import Cocoa

// A tiny macOS menu bar app that shows Codex CLI's live status: an animated
// Codex icon while it's thinking or running a tool, a yellow dot when it's
// awaiting your permission, and the elapsed time of the current turn.
//
// Stateless: Codex hooks write the global status and per-session payloads; the
// app polls those files every 0.4s and renders the icon and label. SessionStart
// launches it; it self-quits once no Codex session marker is active.
//
// Codex branding: a programmatic OpenAI-style hexagon logo, the Codex CLI
// shimmering-bullet activity indicator, and a spark-burst animation.

final class StatusController: NSObject, NSMenuDelegate {
    let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    let paths = StatusBarPaths()
    let codexDesktopBundleID = "com.openai.codex"
    lazy var sessionStore = SessionStore(paths: paths)
    lazy var transcriptResolver = TranscriptResolver()
    var statePath: String { paths.statePath }
    var sessionsDir: String { paths.activeSessionsDir }

    var lastMTime: Date = .distantPast
    // Cached session scan: reused across evaluate() ticks when the session
    // directories haven't changed, so idle polling doesn't stat + decode dozens
    // of files every 0.4s. Invalidated when sessions.d/ or session-state/ mtime
    // changes (all hook writes go through atomic rename, which bumps the parent
    // dir mtime).
    var sessionScanCache: (sessionsDirMtime: Date, sessionStateDirMtime: Date, stateMtime: Date, files: [(uuid: String, mtime: Date)], payloads: [StatusPayload])?
    var pollTimer: Timer?
    var animTimer: Timer?
    var menuIsOpen = false
    var sessionMenuItems: [(NSMenuItem, String)] = []
    var frameIdx = 0

    let launchedAt = Date()
    var notNeededSince: Date?
    let launchGrace: TimeInterval = 5   // settle time after launch before we may quit
    let idleQuitDelay: TimeInterval = 3 // "not needed" must persist this long before quitting

    var current: StatusPayload = .idle
    var activeBase = ""        // label without the elapsed clock
    var startedAt: Double = 0  // unix seconds the current turn began (0 = no clock)
    var activeColor: NSColor? = nil

    // OpenAI/Codex brand green (#10A37F) — the recognizable Codex accent.
    let brand = NSColor(srgbRed: 0.063, green: 0.639, blue: 0.498, alpha: 1)
    let amber = NSColor(srgbRed: 0.95, green: 0.73, blue: 0.18, alpha: 1) // "awaiting permission"

    let icons = IconRenderer()
    let updateChecker = UpdateChecker()
    var showTimer = false
    var selectedRecentSessionId: String?
    var iconColorMode: IconColorMode = .bluePurple
    var playSound = false
    lazy var completionSound: NSSound? = {
        guard let p = Bundle.main.path(forResource: "completion", ofType: "wav"),
              let s = NSSound(contentsOfFile: p, byReference: true) else { return nil }
        s.volume = 0.7
        return s
    }()
    lazy var permissionSound: NSSound? = {
        guard let p = Bundle.main.path(forResource: "pending", ofType: "wav"),
              let s = NSSound(contentsOfFile: p, byReference: true) else { return nil }
        s.volume = 0.7
        return s
    }()
    var prevEff = ""               // last effective state, for detecting turn completion
    var lastTurnStart: Double = 0  // active turn's start time, for the 1-minute gate
    var iconColor: NSColor? {
        switch iconColorMode {
        case .bluePurple: return brand  // blue/purple gradient accent
        case .bw: return NSColor.black
        }
    }

    var fps: Double {
        icons.fps
    }
    var frameCount: Int {
        icons.frameCount
    }

    override init() {
        super.init()
        // A manual launch means the user wants the app back: clear any prior
        // "user quit" flag so SessionStart hooks may auto-relaunch us again.
        try? FileManager.default.removeItem(atPath: paths.userQuitFlagPath)
        let d = UserDefaults.standard
        if d.object(forKey: "showTimer") != nil { showTimer = d.bool(forKey: "showTimer") }
        selectedRecentSessionId = d.string(forKey: "selectedRecentSessionId")
        if d.object(forKey: "completionSound") != nil {
            // Migrate the pre-rename key "completionSound" → "playSound".
            playSound = d.bool(forKey: "completionSound")
            d.set(playSound, forKey: "playSound")
            d.removeObject(forKey: "completionSound")
        } else if d.object(forKey: "playSound") != nil {
            playSound = d.bool(forKey: "playSound")
        }
        // Migrate the pre-rename rawValue "system" → "bluePurple" so existing
        // users keep their color preference.
        if let s = d.string(forKey: "iconColorMode") {
            let migrated = (s == "system") ? "bluePurple" : s
            if migrated != s { d.set(migrated, forKey: "iconColorMode") }
            if let m = IconColorMode(rawValue: migrated) { iconColorMode = m }
        }
        icons.colorMode = iconColorMode
        if let s = d.string(forKey: "animStyle"), let st = AnimStyle(rawValue: s) { icons.animStyle = st }
        let menu = NSMenu()
        menu.delegate = self
        menu.showsStateColumn = false
        menu.minimumWidth = MenuRowLayout.width
        statusItem.menu = menu
        render(label: "", color: iconColor, animate: false, startedAt: 0)
        let t = Timer(timeInterval: 0.4, repeats: true) { [weak self] _ in self?.tick() }
        RunLoop.main.add(t, forMode: .common)
        pollTimer = t
        tick()
        ensureHooksInstalled()
        updateChecker.checkForUpdate()
    }

    // Re-runs on first install AND on every version change, so upgrades pick
    // up hook changes and retire old artifacts.
    func ensureHooksInstalled() {
        HookInstaller.ensureHooksInstalled(currentVersion: updateChecker.currentVersion)
    }

    // MARK: update check

    @objc func openLatestRelease() {
        updateChecker.openLatestRelease()
    }

    // MARK: menu

    func menuWillOpen(_ menu: NSMenu) {
        menuIsOpen = true
        refreshOpenMenuRows()
    }

    func menuDidClose(_ menu: NSMenu) {
        menuIsOpen = false
        sessionMenuItems.removeAll()
    }

    func refreshOpenMenuRows() {
        for (item, _) in sessionMenuItems {
            guard let view = item.view as? SessionMenuRowView else { continue }
            view.refresh(from: self)
        }
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        sessionMenuItems.removeAll()
        updateChecker.checkForUpdate()

        // Dismiss the "Done" label once the user opens the menu.
        if current.state == .done {
            current = .idle
            evaluate()
        }

        // Sessions — shows the current and recently active Codex sessions.
        let recents = recentSessions(limit: 12)
        if !recents.isEmpty {
            menu.addItem(header("Sessions"))

            let visible = Array(recents.prefix(5))
            let hidden = Array(recents.dropFirst(5))

            for s in visible {
                let item = recentSessionItem(s)
                menu.addItem(item)
                sessionMenuItems.append((item, s.uuid))
            }

            if !hidden.isEmpty {
                let moreMenu = NSMenu()
                for s in hidden {
                    let item = recentSessionItem(s)
                    moreMenu.addItem(item)
                    sessionMenuItems.append((item, s.uuid))
                }
                menu.addItem(submenuItem(title: "More", submenu: moreMenu))
            }
        }

        menu.addItem(separatorItem())
        menu.addItem(header("Options"))

        menu.addItem(toggleMenuItem(title: "Show timer", isOn: showTimer) { [weak self] on in
            self?.showTimer = on
            UserDefaults.standard.set(on, forKey: "showTimer")
            self?.applyTitle()
        })
        menu.addItem(toggleMenuItem(title: "Completion sound", isOn: playSound) { [weak self] on in
            self?.playSound = on
            UserDefaults.standard.set(on, forKey: "playSound")
        })

        menu.addItem(separatorItem())
        menu.addItem(header("Types"))
        menu.addItem(submenuItem(title: "Animation Style", items: animationMenuItems()))
        menu.addItem(submenuItem(title: "Color theme", items: colorMenuItems()))

        menu.addItem(separatorItem())
        menu.addItem(fixedMenuItem(title: "Open Codex") { [weak self] in
            self?.openCodex()
        })
        menu.addItem(fixedMenuItem(title: "Open Preview Dashboard") { [weak self] in
            self?.openDashboard()
        })

        menu.addItem(separatorItem())
        menu.addItem(fixedMenuItem(title: "Version \(updateChecker.currentVersion)"))
        if let latest = UserDefaults.standard.string(forKey: "latestVersion"),
           updateChecker.versionIsNewer(latest, than: updateChecker.currentVersion) {
            menu.addItem(fixedMenuItem(title: "Update available") { [weak self] in
                self?.openLatestRelease()
            })
        }
        menu.addItem(fixedMenuItem(title: "Quit") { [weak self] in
            self?.quit()
        })
    }

    func animationMenuItems() -> [NSMenuItem] {
        var items: [NSMenuItem] = []
        for (style, name) in [(AnimStyle.orbit, "Codex Orbit"), (AnimStyle.pulse, "Codex CLI"), (AnimStyle.spark, "Codex Spark"), (AnimStyle.character, "Codex Character"), (AnimStyle.worldcup, "Codex Character Worldcup")] {
            let it = NSMenuItem(title: name, action: #selector(chooseStyle(_:)), keyEquivalent: "")
            it.target = self
            it.representedObject = style.rawValue
            it.state = icons.animStyle == style ? .on : .off
            items.append(it)
        }
        return items
    }

    func colorMenuItems() -> [NSMenuItem] {
        var items: [NSMenuItem] = []
        for (mode, name) in [(IconColorMode.bluePurple, "Blue and purple"), (IconColorMode.bw, "Black and white")] {
            let it = NSMenuItem(title: name, action: #selector(chooseColor(_:)), keyEquivalent: "")
            it.target = self
            it.representedObject = mode.rawValue
            it.state = iconColorMode == mode ? .on : .off
            items.append(it)
        }
        return items
    }

    func submenuItem(title: String, items: [NSMenuItem]) -> NSMenuItem {
        let submenu = NSMenu()
        for child in items {
            submenu.addItem(child)
        }
        return submenuItem(title: title, submenu: submenu)
    }

    func submenuItem(title: String, submenu: NSMenu) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.submenu = submenu
        item.view = FixedMenuRowView(title: title, style: .submenu, submenu: submenu)
        return item
    }

    func toggleMenuItem(title: String, isOn: Bool, onToggle: @escaping (Bool) -> Void) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.view = ToggleMenuRowView(title: title, isOn: isOn, onToggle: onToggle)
        return item
    }

    func header(_ title: String) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.isEnabled = false
        item.view = FixedMenuRowView(title: title, style: .header)
        return item
    }

    func fixedMenuItem(title: String, action: (() -> Void)? = nil) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.isEnabled = action != nil || MenuRowLayout.infoRowsAreEnabled
        item.view = FixedMenuRowView(title: title, style: action == nil ? .info : .action, action: action)
        return item
    }

    func separatorItem() -> NSMenuItem {
        let item = NSMenuItem(title: "", action: nil, keyEquivalent: "")
        item.isEnabled = false
        item.view = FixedMenuSeparatorView()
        return item
    }

    @objc func quit() {
        // Mark an explicit user quit so SessionStart hooks don't auto-relaunch
        // us on the next Codex session. Cleared on the next manual launch.
        // createFile overwrites if the flag already exists.
        _ = FileManager.default.createFile(atPath: paths.userQuitFlagPath, contents: nil)
        NSApp.terminate(nil)
    }

    @objc func openCodex() {
        let ws = NSWorkspace.shared
        if let url = ws.urlForApplication(withBundleIdentifier: "com.openai.codex") {
            ws.openApplication(at: url, configuration: NSWorkspace.OpenConfiguration())
        } else {
            showCodexDownloadAlert()
        }
    }

    func showCodexDownloadAlert() {
        let alert = NSAlert()
        alert.messageText = "Codex desktop app is not installed"
        alert.informativeText = "Download Codex app, install it, then choose Open Codex again."
        alert.alertStyle = .informational
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }

    @objc func openDashboard() {
        // dashboard.html is bundled inside the app at Contents/Resources/,
        // alongside its public/assets/ frame tree. Fall back to the source
        // tree only for unbundled dev builds.
        let ws = NSWorkspace.shared
        if let bundled = Bundle.main.url(forResource: "dashboard", withExtension: "html") {
            ws.open(bundled)
        } else {
            let src = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
                .appendingPathComponent("dashboard.html")
            guard FileManager.default.fileExists(atPath: src.path) else { return }
            ws.open(src)
        }
    }

    // MARK: recent sessions

    struct RecentSession {
        let uuid: String
        let mtime: Date
        let title: String     // session objective from transcript, "" if unknown
        let project: String   // cwd basename, "" if unknown
        let transcript: String
        let source: String
    }

    // List recent session ids from active markers and durable status payloads,
    // resolved to their project name and session title via the transcript.
    func recentSessions(limit: Int) -> [RecentSession] {
        return recentSessionFiles(limit: limit).map { (uuid, mtime) in
            let metadata = transcriptResolver.metadata(uuid: uuid, mtime: mtime)
            return RecentSession(
                uuid: uuid,
                mtime: mtime,
                title: metadata.title,
                project: metadata.project,
                transcript: metadata.transcript,
                source: metadata.source
            )
        }
    }

    func recentSessionFiles(limit: Int) -> [(uuid: String, mtime: Date)] {
        sessionStore.recentSessionFiles(limit: limit)
    }

    // Build a menu item for a recent session with a two-line attributed title:
    //   line 1: session title (semibold, label color)
    //   line 2: project : status (small, secondary gray)
    func recentSessionItem(_ session: RecentSession) -> NSMenuItem {
        let isActive = !current.sessionId.isEmpty && session.uuid == current.sessionId
        let title = recentSessionPlainTitle(for: session, isActive: isActive)
        let item = NSMenuItem(title: title, action: #selector(selectRecentSession(_:)), keyEquivalent: "")
        item.target = self
        item.representedObject = session.uuid
        item.isEnabled = true

        item.view = SessionMenuRowView(
            session: session,
            title: sessionMenuTitle(for: session),
            detail: sessionMenuDetail(for: session),
            timeText: sessionMenuTime(for: session),
            sourceText: session.source,
            visualState: sessionVisualState(for: session),
            target: self
        )
        item.toolTip = session.transcript.isEmpty ? nil : session.transcript
        return item
    }

    func sessionMenuTitle(for session: RecentSession) -> String {
        let rawTitle = session.title.isEmpty ? (session.project.isEmpty ? String(session.uuid.prefix(8)) + "…" : session.project) : session.title
        return rawTitle.count > 24 ? String(rawTitle.prefix(24)) + "..." : rawTitle
    }

    func sessionMenuTime(for session: RecentSession) -> String {
        if !current.sessionId.isEmpty,
           session.uuid == current.sessionId,
           (current.state == .thinking || current.state == .tool),
           current.startedAt > 0 {
            return compactDuration(Date().timeIntervalSince1970 - current.startedAt)
        }
        return ""
    }

    func sessionMenuDetail(for session: RecentSession) -> String {
        let project = session.project.isEmpty ? String(session.uuid.prefix(8)) + "…" : session.project
        let status: String
        if !current.sessionId.isEmpty, session.uuid == current.sessionId {
            status = workingLabel()
        } else {
            status = "done"
        }
        let time = sessionMenuTime(for: session)
        return time.isEmpty ? "\(project) · \(status)" : "\(project) · \(status) · \(time)"
    }

    func sessionVisualState(for session: RecentSession) -> SessionMenuRowView.VisualState {
        if !current.sessionId.isEmpty,
           session.uuid == current.sessionId,
           (current.state == .thinking || current.state == .tool) {
            return .spinning
        }
        if !current.sessionId.isEmpty,
           session.uuid == current.sessionId,
           current.state == .permission {
            return .permission
        }
        if selectedRecentSessionId == session.uuid { return .checked }
        return .stopped
    }

    func compactDuration(_ interval: TimeInterval) -> String {
        let secs = max(0, Int(interval))
        if secs < 60 { return "\(secs)s" }
        if secs < 3600 { return "\(secs / 60)m \(secs % 60)s" }
        if secs < 86400 {
            return "\(secs / 3600)h \((secs % 3600) / 60)m"
        }
        return "\(secs / 86400)d"
    }

    func recentSessionPlainTitle(for session: RecentSession, isActive: Bool) -> String {
        let project = session.project.isEmpty ? String(session.uuid.prefix(8)) + "…" : session.project
        let status = isActive ? workingLabel() : relativeTime(session.mtime)
        let rawTitle = session.title.isEmpty ? project : session.title

        // Show only the first 20 characters of the session title; append "..."
        // for anything longer so the menu stays compact.
        let title: String = rawTitle.count > 20
            ? String(rawTitle.prefix(20)) + "..."
            : rawTitle

        return "\(title)\n\(project) : \(status)"
    }

    func recentSessionTitle(for session: RecentSession, isActive: Bool) -> NSAttributedString {
        let titleFont = NSFont.systemFont(ofSize: 13, weight: .semibold)
        let text = recentSessionPlainTitle(for: session, isActive: isActive)

        let result = NSMutableAttributedString(string: text)
        let nsText = text as NSString
        let titleLen = nsText.range(of: "\n").location
        let metaStart = titleLen + 1 // +1 for the newline
        let metaLen = nsText.length - metaStart

        let paragraph = NSMutableParagraphStyle()
        paragraph.lineSpacing = 1
        paragraph.paragraphSpacing = 0

        result.addAttributes([
            .font: titleFont,
            .foregroundColor: NSColor.labelColor,
            .paragraphStyle: paragraph,
        ], range: NSRange(location: 0, length: titleLen))

        if metaLen > 0 {
            result.addAttributes([
                .font: NSFont.systemFont(ofSize: 11, weight: .regular),
                .foregroundColor: NSColor.secondaryLabelColor,
                .paragraphStyle: paragraph,
            ], range: NSRange(location: metaStart, length: metaLen))
        }
        return result
    }

    func headerText(for session: RecentSession, payload: StatusPayload) -> (label: String, startedAt: Double)? {
        guard !payload.sessionId.isEmpty && session.uuid == payload.sessionId else { return nil }
        return (workingLabel(for: payload), payload.startedAt)
    }

    func relativeTime(_ date: Date) -> String {
        let s = Date().timeIntervalSince(date)
        if s < 60 { return "now" }
        if s < 3600 { return "\(Int(s / 60))m ago" }
        if s < 86400 { return "\(Int(s / 3600))h ago" }
        return "\(Int(s / 86400))d ago"
    }

    func workingLabel() -> String {
        workingLabel(for: current)
    }

    func workingLabel(for payload: StatusPayload) -> String {
        switch payload.state {
        case .thinking: return "thinking"
        case .tool: return payload.tool.isEmpty ? "running tool" : "running \(payload.tool)"
        case .permission: return "awaiting permission"
        case .waiting: return "waiting"
        case .done: return "done"
        default: return "idle"
        }
    }

    @objc func selectRecentSession(_ sender: NSMenuItem) {
        guard let uuid = sender.representedObject as? String, !uuid.isEmpty else { return }
        selectRecentSession(uuid: uuid)
    }

    func selectRecentSession(uuid: String) {
        selectedRecentSessionId = uuid
        UserDefaults.standard.set(uuid, forKey: "selectedRecentSessionId")
        evaluate()
    }

    @objc func toggleTimer() {
        showTimer.toggle()
        UserDefaults.standard.set(showTimer, forKey: "showTimer")
        applyTitle()
    }

    @objc func toggleSound() {
        playSound.toggle()
        UserDefaults.standard.set(playSound, forKey: "playSound")
    }

    @objc func chooseColor(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let mode = IconColorMode(rawValue: raw) else { return }
        iconColorMode = mode
        icons.colorMode = mode
        UserDefaults.standard.set(raw, forKey: "iconColorMode")
        evaluate()
    }

    @objc func chooseStyle(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let st = AnimStyle(rawValue: raw) else { return }
        icons.animStyle = st
        UserDefaults.standard.set(raw, forKey: "animStyle")
        animTimer?.invalidate(); animTimer = nil
        frameIdx = 0
        evaluate()
    }

    // MARK: state polling

    func tick() {
        checkLifecycle()
        let fm = FileManager.default
        guard let attrs = try? fm.attributesOfItem(atPath: statePath),
              let m = attrs[.modificationDate] as? Date else {
            evaluate(); return
        }
        if m != lastMTime {
            lastMTime = m
            if let data = fm.contents(atPath: statePath),
               let obj = try? JSONDecoder().decode(StatusPayload.self, from: data) {
                current = obj
            }
        }
        evaluate()
        if menuIsOpen { refreshOpenMenuRows() }
    }

    // Scan sessions.d/ and session-state/ once, caching the result until either
    // directory's mtime changes. This turns the idle polling path from "4 dir
    // scans + 24 file reads + 36 transcript opens per 0.4s" into "3 stat calls
    // per 0.4s" when nothing on disk has changed.
    //
    // Three mtimes are tracked: sessions.d/ (marker create/delete), session-state/
    // (per-session payload, written via atomic rename), and state.json (global
    // payload, written via atomic rename). The state.json gate is defense-in-depth:
    // update.js always writes state.json via rename, so its dir mtime always bumps.
    // But sessions.d/ markers are overwritten in-place by update.js, which does NOT
    // bump the parent dir mtime on macOS. Gating on state.json too ensures we never
    // serve stale payloads even if a future hook writes sessions.d/ without also
    // writing session-state/.
    func sessionScan() -> (files: [(uuid: String, mtime: Date)], payloads: [StatusPayload]) {
        let fm = FileManager.default
        let sessionsMtime = (try? fm.attributesOfItem(atPath: sessionsDir))?[.modificationDate] as? Date ?? .distantPast
        let sessionStateMtime = (try? fm.attributesOfItem(atPath: paths.sessionStateDir))?[.modificationDate] as? Date ?? .distantPast
        let stateMtime = (try? fm.attributesOfItem(atPath: statePath))?[.modificationDate] as? Date ?? .distantPast
        if let cache = sessionScanCache,
           cache.sessionsDirMtime == sessionsMtime,
           cache.sessionStateDirMtime == sessionStateMtime,
           cache.stateMtime == stateMtime {
            return (cache.files, cache.payloads)
        }
        let files = sessionStore.recentSessionFiles(limit: 24)
        let payloads = sessionStore.payloads(for: files)
        sessionScanCache = (sessionsMtime, sessionStateMtime, stateMtime, files, payloads)
        return (files, payloads)
    }

    func evaluate() {
        let (sessionFiles, sessionPayloads) = sessionScan()
        let headerRecents = sessionFiles.prefix(12).map { RecentSession(uuid: $0.uuid, mtime: $0.mtime, title: "", project: "", transcript: "", source: "") }
        let resolution = HeaderStatusPolicy.resolve(
            storedId: selectedRecentSessionId,
            recents: headerRecents.map { HeaderSessionChoice(uuid: $0.uuid) },
            current: current,
            sessionPayloads: sessionPayloads,
            now: Date().timeIntervalSince1970
        )
        let selectedHeaderSession = resolution.selectedSessionId.flatMap { selectedId in
            headerRecents.first { $0.uuid == selectedId }
        }
        if let selectedId = resolution.selectedSessionId, selectedRecentSessionId != selectedId {
            selectedRecentSessionId = selectedId
            UserDefaults.standard.set(selectedId, forKey: "selectedRecentSessionId")
        }
        let display = resolution.payload
        let state = display.state
        var label = display.label
        let ts = display.ts
        let started = display.startedAt
        let age = Date().timeIntervalSince1970 - ts

        var eff = state
        // Stop fires on normal completion but NOT on an Esc interrupt or a
        // denied permission prompt: Codex writes "[Request interrupted by
        // user]" to the transcript and ends with no hook, freezing state.json.
        // Recover off that marker. (Force-quit writes no marker; lifecycle.js
        // handles that case.)
        if state == .thinking || state == .tool || state == .permission {
            if age > 900 && !sessionIsActive(display.sessionId) { eff = .idle; label = "" } // absolute safety net
            else if let last = lastLine(ofFileAt: display.transcript),
                    last.contains("interrupted by user") {
                eff = .idle; label = ""
            }
        }

        // Chime once when a turn that ran >= 1 min transitions to "done".
        if (eff == .thinking || eff == .tool), started > 0 { lastTurnStart = started }
        if eff == .done, prevEff != "done", playSound,
           lastTurnStart > 0, Date().timeIntervalSince1970 - lastTurnStart >= 60 {
            completionSound?.play()
        }
        // Blip once when entering the awaiting-permission state.
        if eff == .permission, prevEff != "permission", playSound {
            permissionSound?.play()
        }
        if eff == .done { lastTurnStart = 0 }
        prevEff = eff.rawValue

        if resolution.shouldSleep {
            renderSleepingCharacter()
            return
        }

        let header = selectedHeaderSession.flatMap { headerText(for: $0, payload: display) }

        switch eff {
        case .thinking:   render(label: header?.label ?? (label.isEmpty ? "Thinking…" : label), color: iconColor, animate: true,  startedAt: header?.startedAt ?? started)
        case .tool:       render(label: header?.label ?? (label.isEmpty ? "Working…"  : label), color: iconColor, animate: true,  startedAt: header?.startedAt ?? started)
        case .permission: render(label: header?.label ?? "Awaiting permission", color: amber, animate: false, startedAt: header?.startedAt ?? 0, dot: true)
        case .waiting:    render(label: header?.label ?? (label.isEmpty ? "Waiting" : label), color: iconColor, animate: false, startedAt: header?.startedAt ?? 0)
        case .done:       render(label: header?.label ?? "Done", color: iconColor, animate: false, startedAt: header?.startedAt ?? 0)
        default:          render(label: header?.label ?? "", color: iconColor, animate: false, startedAt: header?.startedAt ?? 0) // idle + unknown: just the logo
        }
    }

    // MARK: self-quit lifecycle

    func codexDesktopRunning() -> Bool {
        NSWorkspace.shared.runningApplications.contains { $0.bundleIdentifier == codexDesktopBundleID }
    }

    func sessionCount() -> Int {
        sessionStore.sessionCount()
    }

    func sessionIsActive(_ sessionId: String) -> Bool {
        sessionStore.sessionIsActive(sessionId)
    }

    // Stay while Codex desktop is open OR a session is active; otherwise quit
    // after a short debounced grace (warmup-session churn must not kill us).
    func checkLifecycle() {
        let now = Date()
        if now.timeIntervalSince(launchedAt) < launchGrace { return }
        if codexDesktopRunning() || sessionCount() > 0 {
            notNeededSince = nil
            return
        }
        if let since = notNeededSince {
            if now.timeIntervalSince(since) >= idleQuitDelay { NSApp.terminate(nil) }
        } else {
            notNeededSince = now
        }
    }

    // Read the last non-empty line of a (possibly large) file by tailing ~8KB.
    func lastLine(ofFileAt path: String) -> String? {
        guard let fh = FileHandle(forReadingAtPath: path) else { return nil }
        defer { try? fh.close() }
        let size = (try? fh.seekToEnd()) ?? 0
        let chunk: UInt64 = 8192
        try? fh.seek(toOffset: size > chunk ? size - chunk : 0)
        guard let data = try? fh.readToEnd(), let s = String(data: data, encoding: .utf8) else { return nil }
        return s.split(separator: "\n").last { !$0.isEmpty }.map(String.init)
    }

    // MARK: render

    func renderSleepingCharacter() {
        guard let button = statusItem.button else { return }
        animTimer?.invalidate(); animTimer = nil
        frameIdx = 0
        activeBase = ""
        activeColor = iconColor
        startedAt = 0
        button.contentTintColor = nil
        button.image = icons.sleepingIcon()
        applyTitle()
    }

    func render(label: String, color: NSColor?, animate: Bool, startedAt: Double, dot: Bool = false) {
        guard let button = statusItem.button else { return }
        button.contentTintColor = nil
        activeBase = label
        activeColor = color
        self.startedAt = startedAt

        if animate {
            if animTimer == nil {
                let t = Timer(timeInterval: 1.0 / fps, repeats: true) { [weak self] _ in self?.animStep() }
                RunLoop.main.add(t, forMode: .common)
                animTimer = t
            }
        } else {
            animTimer?.invalidate(); animTimer = nil
            frameIdx = 0
            button.image = dot ? icons.dotIcon(color: color) : icons.restingIcon(color: color)
        }
        applyTitle()
        if button.image == nil { button.image = dot ? icons.dotIcon(color: color) : icons.restingIcon(color: color) }
    }

    func animStep() {
        frameIdx = (frameIdx + 1) % frameCount
        statusItem.button?.image = icons.iconImage(color: activeColor, frame: frameIdx)
        applyTitle()
    }

    func applyTitle() {
        guard let button = statusItem.button else { return }
        var text = activeBase
        let lower = text.lowercased()
        if !text.isEmpty && lower != "done" && lower != "awaiting permission" {
            text += "..."
        }
        if showTimer, startedAt > 0 {
            let secs = max(0, Int(Date().timeIntervalSince1970 - startedAt))
            let m = secs / 60, s = secs % 60
            text += "  " + (m > 0 ? "\(m)m \(s)s" : "\(s)s")
        }
        if text.isEmpty {
            button.imagePosition = .imageOnly
            button.attributedTitle = NSAttributedString(string: "")
            return
        }
        button.imagePosition = .imageLeading
        let attrs: [NSAttributedString.Key: Any] = [
            .foregroundColor: NSColor.labelColor,
            .font: NSFont.monospacedDigitSystemFont(ofSize: 0, weight: .regular),
        ]
        button.attributedTitle = NSAttributedString(string: " \(text)", attributes: attrs)
    }

}

let app = NSApplication.shared
app.setActivationPolicy(.accessory) // hide from dock; menu bar only
let controller = StatusController()
app.run()
