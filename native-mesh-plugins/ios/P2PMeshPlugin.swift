import Foundation
import MultipeerConnectivity
import Capacitor

@objc(P2PMeshPlugin)
public class P2PMeshPlugin: CAPPlugin, MCNearbyServiceAdvertiserDelegate, MCNearbyServiceBrowserDelegate, MCSessionDelegate {
    
    var peerID: MCPeerID!
    var session: MCSession!
    var advertiser: MCNearbyServiceAdvertiser!
    var browser: MCNearbyServiceBrowser!
    let serviceType = "saito-mesh"

    @objc func startMesh(_ call: CAPPluginCall) {
        peerID = MCPeerID(displayName: UIDevice.current.name)
        session = MCSession(peer: peerID, securityIdentity: nil, encryptionPreference: .required)
        session.delegate = self
        
        advertiser = MCNearbyServiceAdvertiser(peer: peerID, discoveryInfo: nil, serviceType: serviceType)
        advertiser.delegate = self
        advertiser.startAdvertisingPeer()
        
        browser = MCNearbyServiceBrowser(peer: peerID, serviceType: serviceType)
        browser.delegate = self
        browser.startBrowsingForPeers()
        
        call.resolve(["status": "Mesh initialized"])
    }

    @objc func send(_ call: CAPPluginCall) {
        guard let payload = call.getString("payload") else { return }
        let data = payload.data(using: .utf8)!
        
        do {
            try session.send(data, toPeers: session.connectedPeers, with: .reliable)
            call.resolve()
        } catch {
            call.reject("Send failed")
        }
    }
    
    // MCSessionDelegate and other delegate methods here...
}
