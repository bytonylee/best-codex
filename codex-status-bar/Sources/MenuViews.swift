import Cocoa

final class ToggleView: NSView {
    static let width: CGFloat = 33
    static let height: CGFloat = 16

    var isOn: Bool {
        didSet { updateState(animated: true) }
    }
    var onToggle: ((Bool) -> Void)?

    private let track = CALayer()
    private let knob = CALayer()
    private var hovered = false
    private var lastToggle = Date.distantPast

    init(isOn: Bool) {
        self.isOn = isOn
        super.init(frame: NSRect(x: 0, y: 0, width: ToggleView.width, height: ToggleView.height))
        wantsLayer = true
        layer = CALayer()
        track.frame = bounds
        track.cornerRadius = bounds.height / 2
        layer?.addSublayer(track)

        let knobHeight = bounds.height - 4
        knob.bounds = CGRect(x: 0, y: 0, width: knobHeight + 3, height: knobHeight)
        knob.cornerRadius = knobHeight / 2
        knob.backgroundColor = NSColor.white.cgColor
        layer?.addSublayer(knob)
        updateState(animated: false)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func knobCenter() -> CGPoint {
        let knobWidth = knob.bounds.width
        let x = isOn ? bounds.width - knobWidth / 2 - 2 : knobWidth / 2 + 2
        return CGPoint(x: x, y: bounds.height / 2)
    }

    private func trackColor() -> CGColor {
        if isOn {
            let accent = NSColor.controlAccentColor
            return (hovered ? (accent.blended(withFraction: 0.10, of: .white) ?? accent) : accent).cgColor
        }
        let dark = effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
        let base: CGFloat = dark ? 1.0 : 0.0
        let alpha: CGFloat = (dark ? 0.30 : 0.34) + (hovered ? 0.10 : 0)
        return NSColor(white: base, alpha: alpha).cgColor
    }

    private func updateState(animated: Bool) {
        let toColor = trackColor()
        let toPosition = knobCenter()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        if animated {
            let spring = CASpringAnimation(keyPath: "position")
            spring.fromValue = NSValue(point: knob.presentation()?.position ?? knob.position)
            spring.toValue = NSValue(point: toPosition)
            spring.damping = 16
            spring.stiffness = 260
            spring.mass = 1
            spring.initialVelocity = 0
            spring.duration = spring.settlingDuration
            knob.add(spring, forKey: "position")

            let color = CABasicAnimation(keyPath: "backgroundColor")
            color.fromValue = track.presentation()?.backgroundColor ?? track.backgroundColor
            color.toValue = toColor
            color.duration = 0.2
            track.add(color, forKey: "backgroundColor")
        }
        knob.position = toPosition
        track.backgroundColor = toColor
        CATransaction.commit()
    }

    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        updateState(animated: false)
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach(removeTrackingArea)
        addTrackingArea(NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self))
    }

    override func mouseEntered(with event: NSEvent) {
        hovered = true
        updateState(animated: false)
    }

    override func mouseExited(with event: NSEvent) {
        hovered = false
        updateState(animated: false)
    }

    override func mouseDown(with event: NSEvent) {
        guard Date().timeIntervalSince(lastToggle) > 0.1 else { return }
        lastToggle = Date()
        isOn.toggle()
        onToggle?(isOn)
    }
}

final class FixedMenuSeparatorView: NSView {
    init() {
        super.init(frame: NSRect(x: 0, y: 0, width: MenuRowLayout.width, height: 9))
        wantsLayer = true
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        NSColor.separatorColor.setStroke()
        let path = NSBezierPath()
        path.move(to: NSPoint(x: 12, y: bounds.midY))
        path.line(to: NSPoint(x: bounds.width - 12, y: bounds.midY))
        path.lineWidth = 1
        path.stroke()
    }
}

final class FixedMenuRowView: NSView {
    enum Style {
        case header
        case info
        case action
        case submenu
    }

    private let style: Style
    private let action: (() -> Void)?
    private let submenu: NSMenu?
    private let label = NSTextField(labelWithString: "")
    private let chevron = NSTextField(labelWithString: "›")
    private let highlightLayer = CALayer()
    private var hovered = false

    init(title: String, style: Style, action: (() -> Void)? = nil, submenu: NSMenu? = nil) {
        self.style = style
        self.action = action
        self.submenu = submenu
        super.init(frame: NSRect(x: 0, y: 0, width: MenuRowLayout.width, height: MenuRowLayout.standardHeight))

        wantsLayer = true
        highlightLayer.cornerRadius = 5
        highlightLayer.isHidden = true
        layer?.addSublayer(highlightLayer)

        label.stringValue = title
        label.font = style == .header
            ? NSFont.systemFont(ofSize: 11, weight: .medium)
            : NSFont.menuFont(ofSize: 0)
        label.textColor = baseLabelColor
        label.lineBreakMode = .byTruncatingTail
        addSubview(label)

        chevron.font = NSFont.menuFont(ofSize: 0)
        chevron.textColor = .secondaryLabelColor
        chevron.alignment = .center
        chevron.isHidden = style != .submenu
        addSubview(chevron)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func layout() {
        super.layout()
        highlightLayer.frame = bounds.insetBy(dx: 6, dy: 2)
        label.frame = NSRect(x: 14, y: 4, width: bounds.width - 42, height: 16)
        chevron.frame = NSRect(x: bounds.width - 25, y: 4, width: 13, height: 16)
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach(removeTrackingArea)
        addTrackingArea(NSTrackingArea(
            rect: bounds,
            options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect],
            owner: self
        ))
    }

    override func mouseEntered(with event: NSEvent) {
        hovered = true
        applyHighlight()
    }

    override func mouseExited(with event: NSEvent) {
        hovered = false
        applyHighlight()
    }

    private func applyHighlight() {
        let highlighted = hovered && (style == .action || style == .submenu)
        highlightLayer.isHidden = !highlighted
        highlightLayer.backgroundColor = NSColor.controlAccentColor.withAlphaComponent(0.92).cgColor
        label.textColor = highlighted ? .white : baseLabelColor
        chevron.textColor = highlighted ? .white : .secondaryLabelColor
    }

    private var baseLabelColor: NSColor {
        switch style {
        case .header, .info: return .secondaryLabelColor
        case .action, .submenu: return .labelColor
        }
    }

    override func mouseDown(with event: NSEvent) {
        switch style {
        case .action:
            enclosingMenuItem?.menu?.cancelTracking()
            action?()
        case .submenu:
            guard let submenu else { return }
            submenu.popUp(positioning: nil, at: NSPoint(x: bounds.maxX - 4, y: bounds.maxY - 2), in: self)
        case .header, .info:
            break
        }
    }
}

final class SessionMenuRowView: NSView {
    enum Layout {
        static let width: CGFloat = MenuRowLayout.width
        static let rightInset: CGFloat = 12
        static let badgeWidth: CGFloat = 30
        static let badgeHeight: CGFloat = 15
    }

    enum VisualState {
        case checked
        case spinning
        case stopped
        case permission
    }

    private weak var target: StatusController?
    private let session: StatusController.RecentSession
    private var visualState: VisualState
    private var spinTimer: Timer?
    private var spinAngle: CGFloat = 0
    private var hovered = false
    private var selected = false
    private var sourceText = ""

    private let indicator = NSTextField(labelWithString: "")
    private let indicatorImage = NSImageView()
    private let titleLabel = NSTextField(labelWithString: "")
    private let detailLabel = NSTextField(labelWithString: "")
    private let highlightLayer = CALayer()
    private let badgeView = NSImageView()

    init(session: StatusController.RecentSession, title: String, detail: String, timeText: String, sourceText: String, visualState: VisualState, target: StatusController) {
        self.session = session
        self.visualState = visualState
        self.target = target
        let selected = target.selectedRecentSessionId == session.uuid
        super.init(frame: NSRect(x: 0, y: 0, width: Layout.width, height: MenuRowLayout.sessionHeight))

        wantsLayer = true
        highlightLayer.cornerRadius = 6
        highlightLayer.isHidden = true
        layer?.addSublayer(highlightLayer)

        indicator.frame = NSRect(x: 14, y: 15, width: 18, height: 18)
        indicator.alignment = .center
        indicator.font = NSFont.systemFont(ofSize: 14, weight: .semibold)
        addSubview(indicator)

        indicatorImage.frame = NSRect(x: 15, y: 16, width: 16, height: 16)
        indicatorImage.imageScaling = .scaleProportionallyUpOrDown
        indicatorImage.isHidden = true
        addSubview(indicatorImage)

        titleLabel.frame = NSRect(x: 40, y: 22, width: Layout.width - 40 - Layout.badgeWidth - Layout.rightInset - 14, height: 17)
        titleLabel.font = NSFont.systemFont(ofSize: 13, weight: .semibold)
        titleLabel.lineBreakMode = .byTruncatingTail
        addSubview(titleLabel)

        detailLabel.frame = NSRect(x: 40, y: 6, width: Layout.width - 56, height: 15)
        detailLabel.font = NSFont.systemFont(ofSize: 10, weight: .regular)
        detailLabel.lineBreakMode = .byTruncatingTail
        addSubview(detailLabel)

        badgeView.frame = NSRect(
            x: Layout.width - Layout.badgeWidth - Layout.rightInset,
            y: 22,
            width: Layout.badgeWidth,
            height: Layout.badgeHeight
        )
        badgeView.imageScaling = .scaleNone
        addSubview(badgeView)

        update(title: title, detail: detail, sourceText: sourceText, visualState: visualState, selected: selected)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    deinit {
        spinTimer?.invalidate()
    }

    func refresh(from target: StatusController) {
        update(
            title: target.sessionMenuTitle(for: session),
            detail: target.sessionMenuDetail(for: session),
            sourceText: session.source,
            visualState: target.sessionVisualState(for: session),
            selected: target.selectedRecentSessionId == session.uuid
        )
    }

    private func update(title: String, detail: String, sourceText: String, visualState: VisualState, selected: Bool) {
        self.visualState = visualState
        self.selected = selected
        self.sourceText = sourceText
        applyHighlight()

        indicator.isHidden = visualState == .spinning
        indicator.textColor = isHighlighted ? .white : indicatorColor
        indicator.stringValue = indicatorText
        indicatorImage.isHidden = visualState != .spinning
        indicatorImage.contentTintColor = isHighlighted ? .white : .labelColor
        indicatorImage.image = visualState == .spinning ? rotatedSpinner(spinAngle) : nil
        titleLabel.textColor = isHighlighted ? .white : .labelColor
        titleLabel.stringValue = title
        detailLabel.textColor = isHighlighted ? NSColor.white.withAlphaComponent(0.76) : .secondaryLabelColor
        detailLabel.stringValue = detail

        let badgeText = normalizedSourceTag(sourceText)
        let badgeColor = isHighlighted ? NSColor.white : NSColor.labelColor
        let badgeBackground = isHighlighted ? NSColor.white.withAlphaComponent(0.22) : badgeBackgroundColor
        badgeView.image = badgeImage(text: badgeText, foreground: badgeColor, background: badgeBackground)

        if visualState == .spinning && spinTimer == nil {
            let timer = Timer(timeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in
                guard let self = self else { return }
                self.spinAngle += 5
                self.indicatorImage.image = self.rotatedSpinner(self.spinAngle)
            }
            RunLoop.main.add(timer, forMode: .common)
            spinTimer = timer
        } else if visualState != .spinning {
            spinTimer?.invalidate()
            spinTimer = nil
            spinAngle = 0
            indicatorImage.image = nil
        }
    }

    private var isHighlighted: Bool {
        selected || hovered
    }

    private func applyHighlight() {
        highlightLayer.isHidden = !isHighlighted
        highlightLayer.backgroundColor = NSColor.controlAccentColor.withAlphaComponent(0.92).cgColor
    }

    override func layout() {
        super.layout()
        highlightLayer.frame = bounds.insetBy(dx: 6, dy: 3)
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach(removeTrackingArea)
        addTrackingArea(NSTrackingArea(
            rect: bounds,
            options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect],
            owner: self
        ))
    }

    override func mouseEntered(with event: NSEvent) {
        hovered = true
        update(
            title: titleLabel.stringValue,
            detail: detailLabel.stringValue,
            sourceText: sourceText,
            visualState: visualState,
            selected: selected
        )
    }

    override func mouseExited(with event: NSEvent) {
        hovered = false
        update(
            title: titleLabel.stringValue,
            detail: detailLabel.stringValue,
            sourceText: sourceText,
            visualState: visualState,
            selected: selected
        )
    }

    private var indicatorText: String {
        switch visualState {
        case .checked: return "✓"
        case .spinning: return ""
        case .stopped: return "›"
        case .permission: return "●"
        }
    }

    private lazy var spinnerBase: NSImage? = {
        let name: String
        if #available(macOS 15.0, *) { name = "progress.indicator" } else { name = "rays" }
        let config = NSImage.SymbolConfiguration(pointSize: 13, weight: .regular)
        guard let symbol = NSImage(systemSymbolName: name, accessibilityDescription: nil)?.withSymbolConfiguration(config) else { return nil }
        let side = ceil(max(symbol.size.width, symbol.size.height)) + 2
        let image = NSImage(size: NSSize(width: side, height: side), flipped: false) { _ in
            symbol.draw(in: NSRect(
                x: (side - symbol.size.width) / 2,
                y: (side - symbol.size.height) / 2,
                width: symbol.size.width,
                height: symbol.size.height
            ))
            return true
        }
        image.isTemplate = true
        return image
    }()

    private func rotatedSpinner(_ angleDegrees: CGFloat) -> NSImage? {
        guard let base = spinnerBase else { return nil }
        let size = base.size
        let image = NSImage(size: size, flipped: false) { rect in
            guard let context = NSGraphicsContext.current?.cgContext else { return false }
            context.translateBy(x: size.width / 2, y: size.height / 2)
            context.rotate(by: -angleDegrees * .pi / 180)
            context.translateBy(x: -size.width / 2, y: -size.height / 2)
            base.draw(in: rect)
            return true
        }
        image.isTemplate = true
        return image
    }

    private var indicatorColor: NSColor {
        switch visualState {
        case .checked: return .controlAccentColor
        case .spinning: return .secondaryLabelColor
        case .stopped: return .tertiaryLabelColor
        case .permission: return NSColor(srgbRed: 0.95, green: 0.73, blue: 0.18, alpha: 1)
        }
    }

    private var badgeBackgroundColor: NSColor {
        let dark = effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
        return (dark ? NSColor.white : NSColor.black).withAlphaComponent(dark ? 0.14 : 0.10)
    }

    private func badgeImage(text rawText: String, foreground: NSColor, background: NSColor) -> NSImage {
        let text = rawText as NSString
        let size = NSSize(width: Layout.badgeWidth, height: Layout.badgeHeight)
        let font = NSFont.monospacedSystemFont(ofSize: 9.5, weight: .semibold)
        return NSImage(size: size, flipped: false) { rect in
            background.setFill()
            NSBezierPath(roundedRect: rect, xRadius: rect.height / 2, yRadius: rect.height / 2).fill()

            let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: foreground]
            let textSize = text.size(withAttributes: attrs)
            text.draw(
                at: NSPoint(x: (rect.width - textSize.width) / 2, y: (rect.height - textSize.height) / 2 - 1),
                withAttributes: attrs
            )
            return true
        }
    }

    private func normalizedSourceTag(_ source: String) -> String {
        source.uppercased() == "APP" ? "APP" : "CLI"
    }

    @objc private func selectSession() {
        target?.selectRecentSession(uuid: session.uuid)
        enclosingMenuItem?.menu?.cancelTracking()
    }

    override func hitTest(_ point: NSPoint) -> NSView? {
        bounds.contains(point) ? self : nil
    }

    override func mouseDown(with event: NSEvent) {
        selectSession()
    }
}

final class ToggleMenuRowView: NSView {
    init(title: String, isOn: Bool, onToggle: @escaping (Bool) -> Void) {
        super.init(frame: NSRect(x: 0, y: 0, width: SessionMenuRowView.Layout.width, height: 24))

        let label = NSTextField(labelWithString: title)
        label.frame = NSRect(x: 14, y: 4, width: SessionMenuRowView.Layout.width - 88, height: 16)
        label.font = NSFont.menuFont(ofSize: 0)
        label.textColor = .labelColor
        addSubview(label)

        let toggle = ToggleView(isOn: isOn)
        toggle.onToggle = onToggle
        toggle.frame.origin = NSPoint(x: SessionMenuRowView.Layout.width - ToggleView.width - 12, y: 4)
        addSubview(toggle)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}
