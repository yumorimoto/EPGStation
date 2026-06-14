import { injectable } from 'inversify';
import * as events from 'events';
import IStreamEvent from './IStreamEvent';

@injectable()
export default class StreamEvent implements IStreamEvent {
    private listener: events.EventEmitter = new events.EventEmitter();

    public emitStreamStateChanged(): void {
        this.listener.emit('stateChanged');
    }

    public setStreamStateChanged(callback: () => void): void {
        this.listener.on('stateChanged', callback);
    }
}
