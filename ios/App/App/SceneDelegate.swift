import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = GameViewController()
        window?.makeKeyAndVisible()

        if ProcessInfo.processInfo.isiOSAppOnMac {
            MacWindow.configure(windowScene)
        }

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func windowScene(_ windowScene: UIWindowScene, didUpdate previousCoordinateSpace: UICoordinateSpace,
                     interfaceOrientation previousInterfaceOrientation: UIInterfaceOrientation,
                     traitCollection previousTraitCollection: UITraitCollection) {
        if ProcessInfo.processInfo.isiOSAppOnMac {
            MacWindow.remember(windowScene)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}


/// On a Mac the game opens as a portrait window that fits the board and the piece tray,
/// centred on screen, and then remembers whatever size the player resizes it to.
enum MacWindow {
    /// "Designed for iPad" apps are drawn at 77% on a Mac: frame sizes are in iPad points,
    /// the screen and frame origins are in Mac points.
    static let macScale: CGFloat = 0.77
    static let minimumSize = CGSize(width: 380, height: 640)
    private static let key = "macWindowSize.v2"
    private static var settling = true // macOS restores the old frame before configure runs; ignore it

    /// Portrait window about 85% of the screen tall (in iPad points).
    static func defaultSize(for screen: CGRect) -> CGSize {
        let h = min(screen.height * 0.85, 1000) / macScale
        return CGSize(width: (h * 0.62).rounded(), height: h.rounded())
    }

    static func configure(_ scene: UIWindowScene) {
        let screen = scene.screen.bounds
        var size = defaultSize(for: screen)
        if let saved = UserDefaults.standard.string(forKey: key) {
            let s = NSCoder.cgSize(for: saved)
            // Only trust a remembered size that is portrait and at least the minimum.
            if s.width >= minimumSize.width && s.height >= minimumSize.height && s.height >= s.width { size = s }
        }
        size.width = min(size.width, (screen.width - 40) / macScale)
        size.height = min(size.height, (screen.height - 60) / macScale)
        NSLog("[MacWindow] configure screen=\(screen) size=\(size)")

        // Pin the size (min = max) so macOS opens the window at it, then let the player resize.
        settling = true
        scene.sizeRestrictions?.minimumSize = size
        scene.sizeRestrictions?.maximumSize = size
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            if #available(iOS 16.0, *) {
                let mac = CGSize(width: size.width * macScale, height: size.height * macScale)
                let origin = CGPoint(x: ((screen.width - mac.width) / 2).rounded(), y: max(30, ((screen.height - mac.height) / 2).rounded()))
                scene.requestGeometryUpdate(.Mac(systemFrame: CGRect(origin: origin, size: size))) { error in
                    NSLog("[MacWindow] geometry request failed: \(error)")
                }
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            scene.sizeRestrictions?.minimumSize = minimumSize
            scene.sizeRestrictions?.maximumSize = CGSize(width: 4000, height: 4000)
            NSLog("[MacWindow] released, now \(scene.coordinateSpace.bounds.size)")
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { settling = false }
    }

    static func remember(_ scene: UIWindowScene) {
        guard !settling else { return }
        let size = scene.coordinateSpace.bounds.size
        guard size.width >= minimumSize.width, size.height >= minimumSize.height else { return }
        // Ignore the 1-2 pt the system adds on each launch, so the size doesn't creep.
        if let saved = UserDefaults.standard.string(forKey: key) {
            let s = NSCoder.cgSize(for: saved)
            if abs(s.width - size.width) < 4 && abs(s.height - size.height) < 4 { return }
        }
        let rounded = CGSize(width: size.width.rounded(), height: size.height.rounded())
        UserDefaults.standard.set(NSCoder.string(for: rounded), forKey: key)
    }
}

/// The web view's root controller, with the Mac trackpad haptics bridge registered.
class GameViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(MacHapticsPlugin())
    }
}

/// Trackpad haptics for the Mac ("Designed for iPad" has no public API for them, but AppKit's
/// NSHapticFeedbackManager is loaded in the process, so it is reached through the runtime).
/// On iPhone/iPad the class doesn't exist and every call is a no-op.
@objc(MacHapticsPlugin)
public class MacHapticsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MacHapticsPlugin"
    public let jsName = "MacHaptics"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "perform", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cursor", returnType: CAPPluginReturnPromise),
    ]

    /// hidden: true hides the Mac pointer (the web view ignores CSS `cursor: none`), so the
    /// tray's magnetic hover can stand in for it, as in the browser.
    @objc func cursor(_ call: CAPPluginCall) {
        let hide = call.getBool("hidden") ?? false
        DispatchQueue.main.async { MacPointer.set(hidden: hide) }
        call.resolve()
    }

    @objc func available(_ call: CAPPluginCall) {
        call.resolve(["value": MacTrackpad.performer != nil])
    }

    /// pattern: 0 generic, 1 alignment, 2 level change. count/gapMs repeat it.
    @objc func perform(_ call: CAPPluginCall) {
        let pattern = call.getInt("pattern") ?? 0
        let count = max(1, min(call.getInt("count") ?? 1, 5))
        let gap = Double(call.getInt("gapMs") ?? 80) / 1000
        for i in 0..<count {
            DispatchQueue.main.asyncAfter(deadline: .now() + gap * Double(i)) { MacTrackpad.perform(pattern) }
        }
        call.resolve()
    }
}

/// AppKit's NSCursor reached through the runtime; hide/unhide are kept balanced.
enum MacPointer {
    private static var hidden = false
    private static let cls: AnyObject? = ProcessInfo.processInfo.isiOSAppOnMac ? NSClassFromString("NSCursor") : nil

    static func set(hidden h: Bool) {
        guard h != hidden, let c = cls else { return }
        let sel = NSSelectorFromString(h ? "hide" : "unhide")
        guard c.responds(to: sel) else { return }
        _ = c.perform(sel)
        hidden = h
    }
}

enum MacTrackpad {
    private typealias PerformFn = @convention(c) (AnyObject, Selector, Int, UInt) -> Void
    private static let sel = NSSelectorFromString("performFeedbackPattern:performanceTime:")

    static let performer: NSObject? = {
        guard ProcessInfo.processInfo.isiOSAppOnMac,
              let cls = NSClassFromString("NSHapticFeedbackManager") as? NSObject.Type,
              cls.responds(to: NSSelectorFromString("defaultPerformer")),
              let p = cls.perform(NSSelectorFromString("defaultPerformer"))?.takeUnretainedValue() as? NSObject,
              p.responds(to: sel) else {
            NSLog("[MacHaptics] not available")
            return nil
        }
        NSLog("[MacHaptics] ready")
        return p
    }()

    static func perform(_ pattern: Int) {
        guard let p = performer else { return }
        let fn = unsafeBitCast(p.method(for: sel), to: PerformFn.self)
        fn(p, sel, pattern, 1) // performanceTime 1 = now
    }
}
