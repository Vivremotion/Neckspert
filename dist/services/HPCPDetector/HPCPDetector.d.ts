export declare class HPCPDetector {
    private audioContext;
    private stream;
    private onHPCPUpdateCallbacks;
    start(): Promise<void>;
    pause(): void;
    subscribe(callback: Function): void;
}
export declare const hpcpDetector: HPCPDetector;
