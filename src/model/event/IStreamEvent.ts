export default interface IStreamEvent {
    emitStreamStateChanged(): void;
    setStreamStateChanged(callback: () => void): void;
}
