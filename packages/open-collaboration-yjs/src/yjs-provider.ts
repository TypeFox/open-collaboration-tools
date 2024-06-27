import * as types from 'open-collaboration-protocol';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';

import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { ObservableV2 } from 'lib0/observable';

export interface AwarenessChange {
    added: number[];
    updated: number[];
    removed: number[];
}

export const LOCAL_ORIGIN = 'local';

export class OpenCollaborationYjsProvider extends ObservableV2<string> {

    private connection: types.ProtocolBroadcastConnection;
    private doc: Y.Doc;
    private awareness: awarenessProtocol.Awareness;
    private synced = false;

    constructor(connection: types.ProtocolBroadcastConnection, doc: Y.Doc, awareness: awarenessProtocol.Awareness) {
        super();
        this.connection = connection;
        this.doc = doc;
        this.awareness = awareness;
        this.doc.on('update', this.yjsUpdateHandler.bind(this));
        this.awareness.on('update', this.yjsAwarenessUpdateHandler.bind(this));

        connection.sync.onDataUpdate(this.ocpDataUpdateHandler.bind(this));
        connection.sync.onAwarenessUpdate(this.ocpAwarenessUpdateHandler.bind(this));
        connection.sync.onAwarenessQuery(this.ocpAwarenessQueryHandler.bind(this));
    }

    private ocpDataUpdateHandler(origin: string, update: types.Binary): void {
        const decoder = this.decode(update);
        const encoder = encoding.createEncoder();
        const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, this.doc, origin);
        if (syncMessageType === syncProtocol.messageYjsSyncStep2 && !this.synced) {
            // todo handle room syncing (might not be necessary)
        } else if (syncMessageType === syncProtocol.messageYjsSyncStep1) {
            this.connection.sync.dataUpdate(origin, this.encode(encoder));
        }
    }

    private ocpAwarenessUpdateHandler(origin: string, update: types.Binary): void {
        const decoder = this.decode(update);
        awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), origin);
    }

    private ocpAwarenessQueryHandler(origin: string): void {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint8Array(
            encoder,
            awarenessProtocol.encodeAwarenessUpdate(this.awareness, Array.from(this.awareness.getStates().keys()))
        );
        this.connection.sync.awarenessUpdate(origin, this.encode(encoder));
    }

    private yjsUpdateHandler(update: Uint8Array, origin: unknown): void {
        if (origin !== this) {
            const encoder = encoding.createEncoder();
            syncProtocol.writeUpdate(encoder, update);
            this.connection.sync.dataUpdate(this.encode(encoder));
        }
    }

    private yjsAwarenessUpdateHandler(changed: AwarenessChange): void {
        const changedClients = changed.added.concat(changed.updated).concat(changed.removed);
        const encoder = encoding.createEncoder();
        encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients));
        this.connection.sync.awarenessUpdate(this.encode(encoder));
    }

    connect(): void {
        // write sync step 1
        const encoderSync = encoding.createEncoder();
        syncProtocol.writeSyncStep1(encoderSync, this.doc);
        this.connection.sync.dataUpdate(this.encode(encoderSync));
        // broadcast local state
        const encoderState = encoding.createEncoder();
        syncProtocol.writeSyncStep2(encoderState, this.doc);
        this.connection.sync.dataUpdate(this.encode(encoderState));
        // query awareness info
        this.connection.sync.awarenessQuery();
        // broadcast local awareness info
        const encoderAwareness = encoding.createEncoder();
        encoding.writeVarUint8Array(
            encoderAwareness,
            awarenessProtocol.encodeAwarenessUpdate(this.awareness, [
                this.doc.clientID
            ])
        );
        this.connection.sync.awarenessUpdate(this.encode(encoderAwareness));
    }

    dispose(): void {
        awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], 'client disconnected');
    }

    private encode(encoder: encoding.Encoder): types.Binary {
        return encoding.toUint8Array(encoder);
    }

    private decode(data: types.Binary): decoding.Decoder {
        return decoding.createDecoder(data);
    }
}
