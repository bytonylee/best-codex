import Cocoa

enum AnimStyle: String {
    case orbit
    case pulse
    case spark
    case character
    case worldcup
}

enum IconColorMode: String {
    case bluePurple
    case bw
}

final class IconRenderer {
    var animStyle: AnimStyle = .character
    var colorMode: IconColorMode = .bluePurple

    private let baseCharacterSubdir = "character"
    private let baseCharacterBWSubdir = "character-bw"
    private let worldcupCharacterSubdir = "character-worldcup"
    private let worldcupCharacterBWSubdir = "character-worldcup-bw"
    private let sleepingCharacterSubdir = "sleeping-character"
    private let sleepingCharacterBWSubdir = "sleeping-character-bw"

    private let orbitFPS: Double = 12
    private let orbitFrames = 24
    private let pulseFPS: Double = 4
    private let pulseFrames = 4
    private let sparkFPS: Double = 10
    private let sparkFrames = 12
    private let characterFPS: Double = 12.5

    private lazy var characterFrames: [NSImage] = loadCharacterFrames(subdir: baseCharacterSubdir)
    private lazy var characterBWFrames: [NSImage] = loadCharacterFrames(subdir: baseCharacterBWSubdir)
    private lazy var worldcupCharacterFrames: [NSImage] = loadCharacterFrames(subdir: worldcupCharacterSubdir)
    private lazy var worldcupCharacterBWFrames: [NSImage] = loadCharacterFrames(subdir: worldcupCharacterBWSubdir)
    private lazy var sleepingCharacterFrames: [NSImage] = loadCharacterFrames(subdir: sleepingCharacterSubdir, count: 1)
    private lazy var sleepingCharacterBWFrames: [NSImage] = loadCharacterFrames(subdir: sleepingCharacterBWSubdir, count: 1)

    var fps: Double {
        switch animStyle {
        case .orbit: return orbitFPS
        case .pulse: return pulseFPS
        case .spark: return sparkFPS
        case .character: return characterFPS
        case .worldcup: return characterFPS
        }
    }

    var frameCount: Int {
        switch animStyle {
        case .orbit: return orbitFrames
        case .pulse: return pulseFrames
        case .spark: return sparkFrames
        case .character: return max(1, characterFrames.count)
        case .worldcup: return max(1, worldcupCharacterFrames.count)
        }
    }

    func iconImage(color: NSColor?, frame: Int) -> NSImage {
        switch animStyle {
        case .orbit: return orbitIcon(color: color, frame: frame)
        case .pulse: return pulseIcon(color: color, frame: frame)
        case .spark: return sparkIcon(color: color, frame: frame)
        case .character: return characterIcon(frame: frame)
        case .worldcup: return characterIcon(frame: frame, worldcup: true)
        }
    }

    func restingIcon(color: NSColor?) -> NSImage {
        if animStyle == .character { return characterIcon(frame: 0) }
        if animStyle == .worldcup { return characterIcon(frame: 0, worldcup: true) }
        return orbitIcon(color: color, frame: 0)
    }

    func sleepingIcon() -> NSImage {
        return characterIcon(frame: 0, sleeping: true)
    }

    func dotIcon(color: NSColor?) -> NSImage {
        let s: CGFloat = 18, d: CGFloat = 9
        let img = NSImage(size: NSSize(width: s, height: s), flipped: false) { _ in
            (color ?? .systemYellow).setFill()
            NSBezierPath(ovalIn: NSRect(x: (s - d) / 2, y: (s - d) / 2, width: d, height: d)).fill()
            return true
        }
        img.isTemplate = (color == nil)
        return img
    }

    private func loadCharacterFrames(subdir: String, count: Int = 6) -> [NSImage] {
        (0..<count).compactMap { index in
            let name = String(format: "%02d", index)
            guard let url = Bundle.main.url(forResource: name, withExtension: "png", subdirectory: subdir) else { return nil }
            return NSImage(contentsOf: url)
        }
    }

    // Gradient for Blue and purple mode: character's blue body color, light → dark (top → bottom).
    // Sampled from character frames: #7B94F0 (light blue) → #364396 (dark blue).
    private func bluePurpleGradient(in rect: NSRect) -> NSGradient? {
        let top = NSColor(srgbRed: 0.48, green: 0.58, blue: 0.94, alpha: 1)    // #7B94F0 light blue
        let bot = NSColor(srgbRed: 0.21, green: 0.27, blue: 0.59, alpha: 1)    // #364396 dark blue
        return NSGradient(starting: top, ending: bot)
    }

    // Gradient for B&W mode: white → black (top → bottom).
    private func bwGradient(in rect: NSRect) -> NSGradient? {
        let top = NSColor(srgbRed: 1.0, green: 1.0, blue: 1.0, alpha: 1)       // white
        let bot = NSColor(srgbRed: 0.0, green: 0.0, blue: 0.0, alpha: 1)       // black
        return NSGradient(starting: top, ending: bot)
    }

    private func gradient(in rect: NSRect) -> NSGradient? {
        colorMode == .bw ? bwGradient(in: rect) : bluePurpleGradient(in: rect)
    }

    private func orbitIcon(color: NSColor?, frame: Int) -> NSImage {
        let s: CGFloat = 18
        let img = NSImage(size: NSSize(width: s, height: s), flipped: false) { rect in
            let cx = rect.midX, cy = rect.midY
            let angle = CGFloat(frame) / CGFloat(self.orbitFrames) * .pi * 2
            let R: CGFloat = s * 0.46
            let rStar: CGFloat = s * 0.24
            let rStarIn: CGFloat = rStar * 0.45
            let path = NSBezierPath()
            path.windingRule = .evenOdd
            for i in 0..<6 {
                let a = angle + CGFloat(i) * .pi / 3
                let p = NSPoint(x: cx + R * cos(a), y: cy + R * sin(a))
                if i == 0 { path.move(to: p) } else { path.line(to: p) }
            }
            path.close()
            for i in 0..<12 {
                let a = angle + CGFloat(i) * .pi / 6
                let rr = (i % 2 == 0) ? rStar : rStarIn
                let p = NSPoint(x: cx + rr * cos(a), y: cy + rr * sin(a))
                if i == 0 { path.move(to: p) } else { path.line(to: p) }
            }
            path.close()
            if let g = self.gradient(in: rect) {
                path.addClip()
                g.draw(in: rect, angle: 270)
            } else {
                (color ?? NSColor.black).setFill()
                path.fill()
            }
            return true
        }
        img.isTemplate = false
        return img
    }

    private func pulseIcon(color: NSColor?, frame: Int) -> NSImage {
        let s: CGFloat = 18
        let scales: [CGFloat] = [0.50, 0.34, 0.22, 0.34]
        let hollow: [Bool] = [false, false, true, true]
        let img = NSImage(size: NSSize(width: s, height: s), flipped: false) { rect in
            let d = s * scales[frame % self.pulseFrames]
            let r = NSRect(x: (s - d) / 2, y: (s - d) / 2, width: d, height: d)
            if hollow[frame % self.pulseFrames] {
                // For hollow frames, stroke with the light end of the gradient.
                let strokeColor = self.colorMode == .bw
                    ? NSColor(srgbRed: 0.9, green: 0.9, blue: 0.9, alpha: 1)
                    : NSColor(srgbRed: 0.48, green: 0.58, blue: 0.94, alpha: 1)  // #7B94F0 light blue
                strokeColor.setStroke()
                let ring = NSBezierPath(ovalIn: r)
                ring.lineWidth = max(1, d * 0.18)
                ring.stroke()
            } else {
                if let g = self.gradient(in: r) {
                    let ovalPath = NSBezierPath(ovalIn: r)
                    ovalPath.addClip()
                    g.draw(in: r, angle: 270)
                } else {
                    (color ?? NSColor.black).setFill()
                    NSBezierPath(ovalIn: r).fill()
                }
            }
            return true
        }
        img.isTemplate = false
        return img
    }

    private func sparkIcon(color: NSColor?, frame: Int) -> NSImage {
        let s: CGFloat = 18
        let img = NSImage(size: NSSize(width: s, height: s), flipped: false) { rect in
            let cx = rect.midX, cy = rect.midY
            let angle = CGFloat(frame) / CGFloat(self.sparkFrames) * .pi * 2
            let breath = 0.7 + 0.3 * (0.5 + 0.5 * cos(angle * 2))
            let R = s * 0.46 * breath
            let r = s * 0.10 * breath
            let path = NSBezierPath()
            for i in 0..<4 {
                let aOut = angle + CGFloat(i) * .pi / 2
                let aIn = aOut + .pi / 4
                let out = NSPoint(x: cx + R * cos(aOut), y: cy + R * sin(aOut))
                let inn = NSPoint(x: cx + r * cos(aIn), y: cy + r * sin(aIn))
                if i == 0 { path.move(to: out) } else { path.line(to: out) }
                path.line(to: inn)
            }
            path.close()
            if let g = self.gradient(in: rect) {
                path.addClip()
                g.draw(in: rect, angle: 270)
            } else {
                (color ?? NSColor.black).setFill()
                path.fill()
            }
            return true
        }
        img.isTemplate = false
        return img
    }

    private func characterIcon(frame: Int, sleeping: Bool = false, worldcup: Bool = false) -> NSImage {
        // Blue and purple mode = blue/purple gradient frames (full color).
        // B&W mode = black-and-white frames (full color, already B&W pixels).
        let frames: [NSImage]
        if sleeping {
            frames = (colorMode == .bw) ? sleepingCharacterBWFrames : sleepingCharacterFrames
        } else if worldcup {
            frames = (colorMode == .bw) ? worldcupCharacterBWFrames : worldcupCharacterFrames
        } else {
            frames = (colorMode == .bw) ? characterBWFrames : characterFrames
        }
        let h: CGFloat = 22
        guard !frames.isEmpty else { return NSImage(size: NSSize(width: h, height: h)) }
        let src = frames[frame % frames.count]
        let display = sleeping ? src.croppedToAlphaBounds() : src
        let rep = display.representations.first
        let pw = CGFloat(rep?.pixelsWide ?? Int(src.size.width))
        let ph = CGFloat(rep?.pixelsHigh ?? Int(display.size.height))
        let w = (ph > 0 ? h * (pw / ph) : h)
        let img = NSImage(size: NSSize(width: w, height: h), flipped: false) { rect in
            display.draw(in: rect, from: .zero, operation: .sourceOver, fraction: 1.0)
            return true
        }
        img.isTemplate = false
        return img
    }
}

private extension NSImage {
    func croppedToAlphaBounds() -> NSImage {
        guard let cgImage = cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            return self
        }
        let width = cgImage.width
        let height = cgImage.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        guard let context = CGContext(
            data: &pixels,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            return self
        }
        context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))

        var minX = width
        var minY = height
        var maxX = -1
        var maxY = -1
        for y in 0..<height {
            for x in 0..<width {
                let offset = (y * width + x) * 4
                let alpha = pixels[offset + 3]
                guard alpha > 0 else { continue }
                minX = min(minX, x)
                minY = min(minY, y)
                maxX = max(maxX, x)
                maxY = max(maxY, y)
            }
        }
        guard maxX >= minX, maxY >= minY else { return self }
        let crop = CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)
        guard let cropped = cgImage.cropping(to: crop) else { return self }
        return NSImage(cgImage: cropped, size: NSSize(width: crop.width, height: crop.height))
    }
}
