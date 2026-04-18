export type HPCPCallback = (hpcp: number[], audioTimestampMs: number) => void;
export declare class HPCPDetector {
    private audioContext;
    private stream;
    private onHPCPUpdateCallbacks;
    start(): Promise<void>;
    private contextTimeToWallMs;
    pause(): void;
    subscribe(callback: HPCPCallback): void;
}
export declare const hpcpDetector: HPCPDetector;
