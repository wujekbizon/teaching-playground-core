import { EventEmitter } from 'events';
export declare class WebRTCService extends EventEmitter {
    private peerConnections;
    private localStream;
    private configuration;
    private transceivers;
    setLocalStream(stream: MediaStream): Promise<void>;
    addStream(peerId: string, stream: MediaStream): Promise<void>;
    private createPeerConnection;
    createOffer(peerId: string): Promise<RTCSessionDescriptionInit>;
    handleOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit>;
    handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void>;
    handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void>;
    closeConnection(peerId: string): void;
    closeAllConnections(): void;
}
