import UIKit
import Capacitor
import GameController

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

    /// Never leave the Mac pointer frozen or hidden when the app goes to the background.
    func sceneWillResignActive(_ scene: UIScene) {
        MacMouse.setLocked(false) { _ in }
        MacMouse.plugin?.emit("lockLost", [:])
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
    static weak var current: GameViewController?
    var wantsPointerLock = false {
        didSet { if wantsPointerLock != oldValue { setNeedsUpdateOfPrefersPointerLocked() } }
    }
    override var prefersPointerLocked: Bool { wantsPointerLock }

    override open func capacitorDidLoad() {
        GameViewController.current = self
        let plugin = MacHapticsPlugin()
        bridge?.registerPluginInstance(plugin)
        MacMouse.plugin = plugin
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
        CAPPluginMethod(name: "pointerLock", returnType: CAPPluginReturnPromise),
    ]

    /// locked: true locks the Mac pointer and streams raw mouse motion/buttons to the page as
    /// "lockMove" {dx, dy} and "lockButton" {down} events. Resolves {locked, how}.
    @objc func pointerLock(_ call: CAPPluginCall) {
        let want = call.getBool("locked") ?? false
        NSLog("[MacMouse] pointerLock(\(want)) requested, mice: \(GCMouse.mice().count)")
        DispatchQueue.main.async {
            MacMouse.setLocked(want) { how in call.resolve(["locked": how != "none", "how": how]) }
        }
    }

    func emit(_ event: String, _ data: [String: Any]) { notifyListeners(event, data: data) }

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

/// Locked-pointer play on the Mac: UIKit pointer lock when the system grants it, else the pointer is
/// frozen in place (CoreGraphics, reached at runtime) and hidden. Motion comes from GCMouse either way.
enum MacMouse {
    static weak var plugin: MacHapticsPlugin?
    private static var locked = false
    private static var frozen = false
    private static var dx: Double = 0, dy: Double = 0
    private static var flushPending = false
    private static var observer: NSObjectProtocol?

    private typealias AssociateFn = @convention(c) (Int32) -> Int32
    private static let associate: AssociateFn? = {
        guard ProcessInfo.processInfo.isiOSAppOnMac,
              let h = dlopen(nil, RTLD_NOW), let f = dlsym(h, "CGAssociateMouseAndMouseCursorPosition") else { return nil }
        return unsafeBitCast(f, to: AssociateFn.self)
    }()

    static func setLocked(_ want: Bool, done: @escaping (String) -> Void) {
        guard ProcessInfo.processInfo.isiOSAppOnMac, let vc = GameViewController.current else { done("none"); return }
        if !want {
            if locked { NSLog("[MacMouse] unlocked") }
            locked = false
            vc.wantsPointerLock = false
            if frozen { _ = associate?(1); frozen = false }
            MacPointer.set(hidden: false)
            done("none")
            return
        }
        locked = true
        loggedMove = false
        attachMice()
        vc.wantsPointerLock = true
        // Give UIKit a moment to grant the lock; fall back to freezing the pointer if it doesn't.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            guard locked else { done("none"); return }
            if vc.view.window?.windowScene?.pointerLockState?.isLocked == true {
                NSLog("[MacMouse] locked (UIKit)")
                done("uikit")
            } else if let f = associate {
                _ = f(0); frozen = true
                MacPointer.set(hidden: true)
                NSLog("[MacMouse] locked (frozen pointer)")
                done("frozen")
            } else {
                NSLog("[MacMouse] lock unavailable")
                locked = false
                done("none")
            }
        }
    }

    /// AppKit mouse events, reached at runtime: NSEvent's local monitor sees every mouse event
    /// in this process, with raw deltas even while the pointer is locked. GCMouse is the backup
    /// (it reports no mice in "Designed for iPad" apps on some Macs).
    private static var monitor: AnyObject?
    private typealias AddMonitorFn = @convention(c) (AnyObject, Selector, UInt64, @convention(block) (AnyObject) -> AnyObject?) -> AnyObject?

    private static func attachAppKitMonitor() -> Bool {
        if monitor != nil { return true }
        guard let cls = NSClassFromString("NSEvent") else { return false }
        let sel = NSSelectorFromString("addLocalMonitorForEventsMatchingMask:handler:")
        guard let m = class_getClassMethod(cls, sel) else { return false }
        let fn = unsafeBitCast(method_getImplementation(m), to: AddMonitorFn.self)
        // leftMouseDown 1, leftMouseUp 2, mouseMoved 5, leftMouseDragged 6, keyDown 10
        let mask: UInt64 = (1 << 1) | (1 << 2) | (1 << 5) | (1 << 6) | (1 << 10)
        let handler: @convention(block) (AnyObject) -> AnyObject? = { ev in
            guard locked, let e = ev as? NSObject else { return ev }
            let type = (e.value(forKey: "type") as? NSNumber)?.intValue ?? 0
            switch type {
            case 10:
                // Esc always frees the pointer (the page may never see Esc while it's locked).
                if (e.value(forKey: "keyCode") as? NSNumber)?.intValue == 53 {
                    NSLog("[MacMouse] Esc")
                    setLocked(false) { _ in }
                    plugin?.emit("lockLost", [:])
                }
            case 1: plugin?.emit("lockButton", ["down": true])
            case 2: plugin?.emit("lockButton", ["down": false])
            default:
                let x = (e.value(forKey: "deltaX") as? NSNumber)?.doubleValue ?? 0
                let y = (e.value(forKey: "deltaY") as? NSNumber)?.doubleValue ?? 0
                queueMove(x, y)
            }
            return ev
        }
        monitor = fn(cls, sel, mask, handler)
        NSLog("[MacMouse] AppKit monitor \(monitor != nil ? "on" : "failed")")
        return monitor != nil
    }

    private static var loggedMove = false
    private static func queueMove(_ x: Double, _ y: Double) {
        if !loggedMove { loggedMove = true; NSLog("[MacMouse] first move \(x), \(y)") }
        dx += x; dy += y
        if flushPending { return }
        flushPending = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.008) {
            flushPending = false
            if dx != 0 || dy != 0 { plugin?.emit("lockMove", ["dx": dx, "dy": dy]) }
            dx = 0; dy = 0
        }
    }

    private static func attachMice() {
        if attachAppKitMonitor() { return }
        GCMouse.mice().forEach(attach)
        if observer == nil {
            observer = NotificationCenter.default.addObserver(forName: .GCMouseDidConnect, object: nil, queue: .main) { n in
                if let m = n.object as? GCMouse { attach(m) }
            }
        }
    }

    private static func attach(_ m: GCMouse) {
        guard let input = m.mouseInput else { return }
        input.mouseMovedHandler = { _, x, y in
            DispatchQueue.main.async {
                guard locked, monitor == nil else { return }
                queueMove(Double(x), -Double(y)) // GameController's y points up
            }
        }
        input.leftButton.pressedChangedHandler = { _, _, pressed in
            DispatchQueue.main.async {
                guard monitor == nil else { return }
                plugin?.emit("lockButton", ["down": pressed])
            }
        }
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
