import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
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
    static let defaultSize = CGSize(width: 470, height: 820)
    static let minimumSize = CGSize(width: 380, height: 640)
    private static let key = "macWindowSize"
    private static var settling = false

    static func configure(_ scene: UIWindowScene) {
        var size = defaultSize
        if let saved = UserDefaults.standard.string(forKey: key) {
            let s = NSCoder.cgSize(for: saved)
            if s.width >= minimumSize.width && s.height >= minimumSize.height { size = s }
        }
        let screen = scene.screen.bounds
        size.width = min(size.width, screen.width - 40)
        size.height = min(size.height, screen.height - 60)
        NSLog("[MacWindow] configure screen=\(screen) size=\(size)")

        // Pin the size (min = max) so macOS opens the window at it, then let the player resize.
        settling = true
        scene.sizeRestrictions?.minimumSize = size
        scene.sizeRestrictions?.maximumSize = size
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            if #available(iOS 16.0, *) {
                let origin = CGPoint(x: (screen.width - size.width) / 2, y: max(25, (screen.height - size.height) / 2))
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
        UserDefaults.standard.set(NSCoder.string(for: size), forKey: key)
    }
}
